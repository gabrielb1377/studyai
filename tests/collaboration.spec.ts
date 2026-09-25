import { expect, test, type Browser, type Page } from "@playwright/test";

const password = "StudyAI2026secure";
const uniqueEmail = (label: string) => `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function register(page: Page, label: string, name: string) {
  await page.goto("/conta");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Email").fill(uniqueEmail(label));
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible();
}

async function api<T>(page: Page, url: string, method = "GET", body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const csrf = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("studyai_csrf="))?.split("=").slice(1).join("=") ?? "";
    const response = await fetch(url, { method, headers: body === undefined ? undefined : { "content-type": "application/json", "x-csrf-token": csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() as T };
  }, { url, method, body });
}

async function member(browser: Browser, label: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, label, name);
  return { context, page };
}

test("sala, convite, papéis, presença e colaboração funcionam entre contas", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await register(page, "owner", "Professora Ada");
  await page.goto("/salas");
  await page.getByLabel("Nome da nova sala").fill("Algoritmos em grupo");
  await page.getByLabel("Tipo da sala").selectOption("classroom");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Algoritmos em grupo" })).toBeVisible({ timeout: 15_000 });

  const rooms = await api<{ rooms: Array<{ id: string }> }>(page, "/api/collaboration/rooms");
  const roomId = rooms.data.rooms[0]?.id;
  expect(roomId).toBeTruthy();
  const invitation = await api<{ invite: { token: string } }>(page, "/api/collaboration/invites", "POST", { roomId, role: "editor", maxUses: 2 });
  expect(invitation.status).toBe(201);

  const editor = await member(browser, "editor", "Grace Hopper");
  const joined = await api(editor.page, "/api/collaboration/join", "POST", { token: invitation.data.invite.token });
  expect(joined.status).toBe(200);
  const note = await api<{ resource: { id: string; version: number } }>(editor.page, `/api/collaboration/rooms/${roomId}/resources`, "POST", { type: "note", title: "Complexidade", data: { content: "O(n log n)" } });
  expect(note.status).toBe(201);
  const firstComment=await api<{comment:{id:string}}>(editor.page, `/api/collaboration/rooms/${roomId}/comments`, "POST", { targetType: "note", targetId: note.data.resource.id, content: "Podemos adicionar um exemplo?" });
  await api(page, `/api/collaboration/rooms/${roomId}/comments`, "POST", { targetType: "note", targetId: note.data.resource.id, parentId:firstComment.data.comment.id, content: "Sim, vou incluir." });
  const updated=await api<{resource:{version:number}}>(editor.page, `/api/collaboration/rooms/${roomId}/resources`, "PATCH", { id: note.data.resource.id, type: "note", title: "Complexidade", data: { content: "O(n log n), como merge sort" }, expectedVersion: 1 });
  expect(updated.data.resource.version).toBe(2);
  const revisions=await api<{revisions:Array<{version:number}>}>(page,`/api/collaboration/rooms/${roomId}/resources/${note.data.resource.id}/revisions`);
  expect(revisions.data.revisions.map((item)=>item.version)).toContain(1);
  expect((await api(page,`/api/collaboration/rooms/${roomId}/resources/${note.data.resource.id}/revisions`,"POST",{version:1})).status).toBe(200);
  expect((await api(editor.page,`/api/collaboration/rooms/${roomId}/progress`,"POST",{resourceId:note.data.resource.id,mode:"group",completed:8,total:10,score:80})).status).toBe(200);
  await api(editor.page, `/api/collaboration/rooms/${roomId}/presence`, "POST", { status: "typing", resourceId: note.data.resource.id });

  const snapshot = await api<{ members: unknown[]; resources: unknown[]; comments: unknown[]; presence: Array<{ name: string; status: string }>;progress:unknown[] }>(page, `/api/collaboration/rooms/${roomId}`);
  expect(snapshot.data.members).toHaveLength(2);
  expect(snapshot.data.resources).toHaveLength(1);
  expect(snapshot.data.comments).toHaveLength(2);
  expect(snapshot.data.progress).toHaveLength(1);
  expect(snapshot.data.presence).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Grace Hopper", status: "typing" })]));

  const conflict = await api(editor.page, `/api/collaboration/rooms/${roomId}/resources`, "PATCH", { id: note.data.resource.id, type: "note", title: "Complexidade", data: { content: "edição antiga" }, expectedVersion: 0 });
  expect(conflict.status).toBe(409);

  await editor.context.close();
});

test("leitor não edita nem comenta e administrador transfere o papel", async ({ page, browser }) => {
  await register(page, "admin", "Alan Turing");
  const ownerSession=await api<{user:{id:string}}>(page,"/auth/session");
  const created = await api<{ room: { id: string } }>(page, "/api/collaboration/rooms", "POST", { name: "Teoria da Computação", kind: "study" });
  const roomId = created.data.room.id;
  const invitation = await api<{ invite: { token: string } }>(page, "/api/collaboration/invites", "POST", { roomId, role: "reader" });
  const reader = await member(browser, "reader", "Leitora Convidada");
  await api(reader.page, "/api/collaboration/join", "POST", { token: invitation.data.invite.token });
  const readerSession = await api<{ user: { id: string } }>(reader.page, "/auth/session");

  expect((await api(reader.page, `/api/collaboration/rooms/${roomId}/resources`, "POST", { type: "note", title: "Sem acesso", data: {} })).status).toBe(403);
  expect((await api(reader.page, `/api/collaboration/rooms/${roomId}/comments`, "POST", { targetType: "concept", targetId: roomId, content: "Sem acesso" })).status).toBe(403);

  expect((await api(page, `/api/collaboration/rooms/${roomId}/members`, "PATCH", { userId: readerSession.data.user.id, role: "admin" })).status).toBe(200);
  const promoted = await api<{ currentRole: string }>(reader.page, `/api/collaboration/rooms/${roomId}`);
  expect(promoted.data.currentRole).toBe("admin");
  expect((await api(reader.page,`/api/collaboration/rooms/${roomId}/members`,"DELETE",{userId:ownerSession.data.user.id})).status).toBe(200);
  expect((await api(page,`/api/collaboration/rooms/${roomId}`)).status).toBe(404);
  expect((await api(reader.page,`/api/collaboration/rooms/${roomId}`,"DELETE",{})).status).toBe(200);
  await reader.context.close();
});

test("interface de salas não causa overflow em celular", async ({ page }) => {
  await register(page, "mobile-room", "Pessoa Mobile");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/salas");
  await expect(page.getByRole("heading", { name: "Salas de estudo" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("administrador de turma visualiza somente o Analytics compartilhado", async ({ page }) => {
  await register(page, "teacher-analytics", "Professora Analytics");
  const created = await api<{ room: { id: string } }>(page, "/api/collaboration/rooms", "POST", { name: "Turma Analytics", kind: "classroom" });
  const roomId = created.data.room.id;
  const resource = await api<{ resource: { id: string } }>(page, `/api/collaboration/rooms/${roomId}/resources`, "POST", { type: "quiz", title: "Quiz compartilhado", data: {} });
  await api(page, `/api/collaboration/rooms/${roomId}/progress`, "POST", { resourceId: resource.data.resource.id, mode: "teacher", completed: 8, total: 10, score: 80 });
  await page.goto("/salas");
  await page.getByRole("button", { name: "Turma Analytics" }).click();
  await page.getByRole("tab", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard do professor" })).toBeVisible();
  await expect(page.getByText("Somente progresso compartilhado nesta turma", { exact: false })).toBeVisible();
  await expect(page.getByText("80%", { exact: true }).first()).toBeVisible();
});
