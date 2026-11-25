import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { AuthService } from "@/server/auth/AuthService";
import { authCookies } from "@/server/auth/http";
import { rateLimit, requestAddress } from "@/server/security/RateLimit";

const SHARE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerStore = await headers();
  const limit = await rateLimit(
    `share-page:${requestAddress(new Request("https://local", { headers: headerStore }))}`,
    60,
    60_000,
  );
  if (!limit.allowed) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Muitas consultas em pouco tempo. Aguarde alguns instantes e tente novamente.
      </div>
    );
  }
  if (!SHARE_TOKEN_PATTERN.test(token)) notFound();
  const shared = await CloudDatabase.shareByToken(token);
  if (!shared) notFound();
  if (shared.share.visibility === "private") {
    const access = (await cookies()).get(authCookies.access)?.value;
    const user = await AuthService.activeAccess(access);
    if (!user) {
      redirect(`/conta?retorno=${encodeURIComponent(`/compartilhar/${token}`)}`);
    }
    if (shared.share.userId !== user.sub) {
      return (
        <div className="mx-auto max-w-xl space-y-2 rounded-xl border bg-card p-6">
          <h1 className="text-lg font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Este compartilhamento privado pertence a outra conta e não está acessível nesta sessão.
          </p>
        </div>
      );
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Conteúdo compartilhado</p>
        <h1 className="mt-1 text-2xl font-semibold">{shared.share.entity}</h1>
        <p className="text-sm text-muted-foreground">
          Registro {shared.share.recordId} · {shared.share.visibility === "private" ? "Privado (somente proprietário)" : "Público"} · Somente leitura
        </p>
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-card p-5 text-sm">
        {JSON.stringify(shared.record?.data ?? null, null, 2)}
      </pre>
    </div>
  );
}
