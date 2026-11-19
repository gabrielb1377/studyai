import { expect, test, type Page } from "@playwright/test";
import { SessionOperationManager } from "../src/features/account/SessionOperationManager";
import { ContextBuilder } from "../src/features/ai/ContextBuilder";
import {
  assertMediaSize,
  hasBlockedMediaMime,
  isWithinMediaLimit,
  MEDIA_LIMITS,
  parseSubtitleOrTranscript,
  validateMediaSignature,
} from "../src/features/extraction/media-validation";
import { isTutorStudyContext } from "../src/features/tutor/utils/tutor-context-validation";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";

function createWavBuffer(durationSeconds = 1, sampleRate = 8000): Buffer {
  const numSamples = Math.max(8, Math.floor(durationSeconds * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function createFakeMp4HeaderBuffer(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70, // ftyp
    0x69, 0x73, 0x6f, 0x6d, // isom
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
    0x6d, 0x70, 0x34, 0x31,
  ]);
}

async function countIndexedDbMediaRecords(page: Page, fileId: string) {
  return page.evaluate(
    async ([targetId, version]) =>
      new Promise<{ documents: number; contents: number; transcriptions: number; chunks: number }>((resolve, reject) => {
        const scope = localStorage.getItem("studyai:storage-scope") || "guest";
        const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
        const request = indexedDB.open(databaseName, version as number);
        request.onerror = () => reject(request.error);
        request.onsuccess = async () => {
          const db = request.result;
          const readAll = (storeName: string) =>
            new Promise<Array<Record<string, unknown>>>((res) => {
              if (!db.objectStoreNames.contains(storeName)) return res([]);
              const tx = db.transaction(storeName, "readonly");
              const req = tx.objectStore(storeName).getAll();
              req.onsuccess = () => res((req.result as Array<Record<string, unknown>>) ?? []);
              req.onerror = () => res([]);
            });

          const [docs, contents, transcriptions, chunks] = await Promise.all([
            readAll("documents"),
            readAll("contents"),
            readAll("transcriptions"),
            readAll("chunks"),
          ]);
          db.close();
          resolve({
            documents: docs.filter((item) => item.id === targetId).length,
            contents: contents.filter((item) => item.fileId === targetId).length,
            transcriptions: transcriptions.filter((item) => item.fileId === targetId).length,
            chunks: chunks.filter((item) => item.materialId === targetId).length,
          });
        };
      }),
    [fileId, STORAGE_DATABASE_VERSION] as [string, number],
  );
}

test.describe("Sprint 57A — Validação, Parser e Pipeline Multimodal", () => {
  test("valida assinatura mágica, bloqueia MIME/payload malicioso, aplica limites e respeita AbortSignal", async () => {
    const validWav = new File([new Uint8Array(createWavBuffer(0.25))], "aula.wav", { type: "audio/wav" });
    await expect(validateMediaSignature(validWav, "wav")).resolves.toBeUndefined();

    const validMp4 = new File([new Uint8Array(createFakeMp4HeaderBuffer())], "video.mp4", { type: "video/mp4" });
    await expect(validateMediaSignature(validMp4, "mp4")).resolves.toBeUndefined();

    const validMp3 = new File([new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0])], "aula.mp3", { type: "audio/mpeg" });
    await expect(validateMediaSignature(validMp3, "mp3")).resolves.toBeUndefined();

    const htmlDisguisedAsMp4 = new File(["<script>alert(1)</script>"], "ataque.mp4", { type: "video/mp4" });
    await expect(validateMediaSignature(htmlDisguisedAsMp4, "mp4")).rejects.toThrow(/Conteúdo inválido/);

    const mismatchedBytesMp3 = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "corrompido.mp3", { type: "audio/mpeg" });
    await expect(validateMediaSignature(mismatchedBytesMp3, "mp3")).rejects.toThrow(/assinatura válida/i);

    const badMimeFile = new File([new Uint8Array(createWavBuffer(0.1))], "audio.wav", { type: "text/html" });
    expect(hasBlockedMediaMime(badMimeFile)).toBe(true);
    await expect(validateMediaSignature(badMimeFile, "wav")).rejects.toThrow(/MIME/);

    const emptyFile = new File([], "vazio.wav", { type: "audio/wav" });
    expect(isWithinMediaLimit(emptyFile)).toBe(false);
    expect(() => assertMediaSize(emptyFile)).toThrow(/vazio/);

    const oversizedAudioLike = { name: "grande.mp3", size: MEDIA_LIMITS.maxAudioBytes + 1, type: "audio/mpeg" } as File;
    expect(isWithinMediaLimit(oversizedAudioLike)).toBe(false);
    expect(() => assertMediaSize(oversizedAudioLike)).toThrow(/100 MB/);

    const oversizedVideoLike = { name: "enorme.mp4", size: MEDIA_LIMITS.maxVideoBytes + 1, type: "video/mp4" } as File;
    expect(isWithinMediaLimit(oversizedVideoLike)).toBe(false);
    expect(() => assertMediaSize(oversizedVideoLike)).toThrow(/250 MB/);

    SessionOperationManager.activate("user-test");
    const operation = SessionOperationManager.start("user-test");
    expect(operation.signal.aborted).toBe(false);
    SessionOperationManager.beginTransition();
    expect(operation.signal.aborted).toBe(true);
    expect(() => operation.assertCurrent()).toThrow();
    operation.release();
  });

  test("faz parse de legendas SRT/VTT/texto manual e diferencia mídia transcrita de metadados no Tutor", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,500
<b>Derivada</b> mede a taxa de variação instantânea.

2
00:00:05,000 --> 00:00:09,000
A regra da potência reduz o expoente em uma unidade.`;

    const parsedSrt = parseSubtitleOrTranscript(srt, 12);
    expect(parsedSrt.source).toBe("subtitle");
    expect(parsedSrt.segments).toHaveLength(2);
    expect(parsedSrt.segments[0].start).toBe(1);
    expect(parsedSrt.segments[0].end).toBe(4.5);
    expect(parsedSrt.segments[0].text).toBe("Derivada mede a taxa de variação instantânea.");
    expect(parsedSrt.text).toContain("A regra da potência");

    const vtt = `WEBVTT

00:01.000 --> 00:03.500
Integral acumula a área sob a curva.`;
    const parsedVtt = parseSubtitleOrTranscript(vtt, 10);
    expect(parsedVtt.source).toBe("subtitle");
    expect(parsedVtt.segments[0].text).toBe("Integral acumula a área sob a curva.");

    const manual = parseSubtitleOrTranscript("Resumo falado pelo professor sobre limites.");
    expect(manual.source).toBe("manual");
    expect(manual.segments).toHaveLength(1);
    expect(manual.segments[0].text).toBe("Resumo falado pelo professor sobre limites.");

    const validContext = {
      studyId: "study-1",
      title: "Cálculo I",
      subject: "Matemática",
      topic: "Derivadas",
      status: "in_progress" as const,
      progress: 40,
      notes: [],
      media: [
        {
          name: "aula-sem-transcricao.mp4",
          type: "video" as const,
          durationSeconds: 320,
          hasTranscription: false,
        },
        {
          name: "aula-legendada.wav",
          type: "audio" as const,
          durationSeconds: 120,
          hasTranscription: true,
          transcriptionSource: "subtitle" as const,
        },
      ],
    };
    expect(isTutorStudyContext(validContext)).toBe(true);

    const rendered = ContextBuilder.fromStudy(validContext);
    expect(rendered).toContain("Mídias vinculadas ao estudo");
    expect(rendered).toContain("aula-sem-transcricao.mp4 (Vídeo, duração 320s): somente metadados — sem transcrição");
    expect(rendered).toContain("aula-legendada.wav (Áudio, duração 120s): com transcrição (legenda)");

    expect(isTutorStudyContext({
      ...validContext,
      media: [{ name: "x.mp4", type: "exe", hasTranscription: false }],
    })).toBe(false);
    expect(isTutorStudyContext({
      ...validContext,
      media: [{ name: "x.mp4", type: "video", durationSeconds: -1, hasTranscription: false }],
    })).toBe(false);
  });
});

test.describe("Sprint 57A — Fluxo E2E de Áudio e Vídeo", () => {
  test("importa áudio em modo offline/metadados, persiste no OPFS após reload, anexa legenda/transcrição, envia contexto correto ao Tutor e remove com segurança", async ({ page }) => {
    const wavBuffer = createWavBuffer(1, 8000);
    const maliciousMp4 = Buffer.from("<script>alert('xss')</script>");

    await page.goto("/importar");
    await page.getByLabel("Modo de transcrição de mídia").selectOption("metadata");

    const fileInput = page.getByLabel("Selecionar arquivos do dispositivo");
    await fileInput.setInputFiles([
      { name: "aula-algebra.wav", mimeType: "audio/wav", buffer: wavBuffer },
      { name: "payload-falso.mp4", mimeType: "video/mp4", buffer: maliciousMp4 },
    ]);

    await page.getByRole("button", { name: "Importar", exact: true }).click();

    await expect(page.getByText("aula-algebra.wav")).toBeVisible();
    await expect(page.getByText("Extraído", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Conteúdo inválido ou não autorizado/i).first()).toBeVisible({ timeout: 20_000 });

    await page.goto("/biblioteca");
    const wavCard = page.getByRole("article", { name: "aula-algebra.wav" });
    await expect(wavCard).toBeVisible({ timeout: 15_000 });
    await wavCard.getByRole("link", { name: "Abrir", exact: true }).click();

    await expect(page.locator("audio")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
    await expect(page.getByText("Sem transcrição (apenas metadados)")).toBeVisible();

    const srtContent = `1
00:00:00,000 --> 00:00:01,000
Equação linear tem grau um e forma uma reta.`;

    await page.getByLabel("Importar arquivo de legenda").setInputFiles({
      name: "aula-algebra.srt",
      mimeType: "text/plain",
      buffer: Buffer.from(srtContent, "utf-8"),
    });

    await expect(page.getByText("Legenda importada")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Equação linear tem grau um e forma uma reta.")).toBeVisible();

    await page.reload();
    await expect(page.locator("audio")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Legenda importada")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Equação linear tem grau um e forma uma reta.")).toBeVisible();

    await page.getByRole("button", { name: "Editar transcrição" }).click();
    await page.getByLabel(/Cole a transcrição manual/i).fill("Revisão manual: coeficiente angular define a inclinação da reta.");
    await page.getByRole("button", { name: "Salvar transcrição" }).click();
    await expect(page.getByText("Transcrição manual")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Revisão manual: coeficiente angular define a inclinação da reta.")).toBeVisible();

    const capturedPayloads: Array<{ message?: string; context?: { media?: Array<Record<string, unknown>> } }> = [];
    await page.route("**/api/tutor", async (route) => {
      const body = route.request().postDataJSON() as { message?: string; context?: { media?: Array<Record<string, unknown>> } };
      capturedPayloads.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          text: "Resposta baseada na transcrição do áudio.",
          model: "gemini-3.7-flash",
        }),
      });
    });

    await page.goto("/biblioteca");
    await page.getByRole("article", { name: "aula-algebra.wav" }).getByRole("link", { name: "Tutor", exact: true }).click();
    await page.getByRole("button", { name: "Nova conversa" }).first().click();
    await expect(page.getByText("Utilizando contexto do tema atual")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Mensagem para o Tutor IA").fill("O que explica a inclinação no áudio?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(
      page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta baseada na transcrição do áudio."),
    ).toBeVisible({ timeout: 15_000 });

    expect(capturedPayloads).toHaveLength(1);
    const mediaList = capturedPayloads[0].context?.media ?? [];
    expect(mediaList.some((item) => item.name === "aula-algebra.wav" && item.type === "audio" && item.hasTranscription === true && item.transcriptionSource === "manual")).toBe(true);

    const fileId = await page.evaluate(async () => {
      const scope = localStorage.getItem("studyai:storage-scope") || "guest";
      const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
      return new Promise<string>((resolve) => {
        const req = indexedDB.open(databaseName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("documents", "readonly");
          const getAll = tx.objectStore("documents").getAll();
          getAll.onsuccess = () => {
            const found = (getAll.result as Array<{ id: string; name: string }>).find((doc) => doc.name === "aula-algebra.wav");
            db.close();
            resolve(found?.id ?? "");
          };
        };
      });
    });
    expect(fileId).not.toBe("");

    await page.goto("/biblioteca");
    await page.getByRole("article", { name: "aula-algebra.wav" }).getByRole("button", { name: "Excluir" }).click();
    await page.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("article", { name: "aula-algebra.wav" })).toHaveCount(0);
    await expect(page.getByText("1 material na biblioteca")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => countIndexedDbMediaRecords(page, fileId), { timeout: 10_000 }).toEqual({
      documents: 0,
      contents: 0,
      transcriptions: 0,
      chunks: 0,
    });
  });

  test("isola mídias entre contas e mantém layout mobile responsivo na visualização de mídia", async ({ page }) => {
    const emailA = `media-alpha-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const emailB = `media-beta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const password = "StudyAI2026secure";

    await page.goto("/conta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByLabel("Nome")).toBeVisible();
    await page.getByLabel("Nome").fill("Conta Media Alpha");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/importar");
    await page.getByLabel("Modo de transcrição de mídia").selectOption("metadata");
    await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
      name: "alpha-privado.wav",
      mimeType: "audio/wav",
      buffer: createWavBuffer(0.5, 8000),
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByText("Extraído", { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Media Beta");
    await page.getByLabel("Email").fill(emailB);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/biblioteca");
    await expect(page.getByText("alpha-privado.wav")).toHaveCount(0);

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/biblioteca");
    const alphaCard = page.getByRole("article", { name: "alpha-privado.wav" });
    await expect(alphaCard).toBeVisible({ timeout: 15_000 });
    await alphaCard.getByRole("link", { name: "Abrir", exact: true }).click();
    await expect(page.locator("audio")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Transcrição e legendas" })).toBeVisible();

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
