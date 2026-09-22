import { notFound } from "next/navigation";
import { CloudDatabase } from "@/server/cloud/CloudDatabase";
export default async function SharedPage({params}:{params:Promise<{token:string}>}){const{token}=await params;const shared=await CloudDatabase.shareByToken(token);if(!shared)notFound();return <div className="mx-auto max-w-3xl space-y-5"><div><p className="text-xs font-medium uppercase tracking-wide text-primary">Conteúdo compartilhado</p><h1 className="mt-1 text-2xl font-semibold">{shared.share.entity}</h1><p className="text-sm text-muted-foreground">Registro {shared.share.recordId}</p></div><pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-card p-5 text-sm">{JSON.stringify(shared.record?.data??null,null,2)}</pre></div>}

