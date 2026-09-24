import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
import { redirect } from "next/navigation";
import { AuthService } from "@/server/auth/AuthService";
import { authCookies } from "@/server/auth/http";

export default async function SharedPage({params}:{params:Promise<{token:string}>}){const{token}=await params;const shared=await CloudDatabase.shareByToken(token);if(!shared)notFound();if(shared.share.visibility==="private"){const access=(await cookies()).get(authCookies.access)?.value;if(!AuthService.access(access))redirect(`/conta?retorno=${encodeURIComponent(`/compartilhar/${token}`)}`);}return <div className="mx-auto max-w-3xl space-y-5"><div><p className="text-xs font-medium uppercase tracking-wide text-primary">Conteúdo compartilhado</p><h1 className="mt-1 text-2xl font-semibold">{shared.share.entity}</h1><p className="text-sm text-muted-foreground">Registro {shared.share.recordId} · {shared.share.visibility==="private"?"Privado":"Público"} · {shared.share.accessLevel==="edit"?"Edição":shared.share.accessLevel==="comment"?"Comentário":"Leitura"}</p></div><pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-card p-5 text-sm">{JSON.stringify(shared.record?.data??null,null,2)}</pre></div>}
