"use client";

import { DoorOpen, GraduationCap, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StudyRoom } from "./types";

export function RoomSidebar({rooms,selectedId,onSelect,onCreate,onJoin,busy}:{rooms:StudyRoom[];selectedId?:string;onSelect:(id:string)=>void;onCreate:(name:string,kind:StudyRoom["kind"])=>void;onJoin:(token:string)=>void;busy:boolean}) {
  return <aside className="space-y-4 rounded-xl border bg-card p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-auto">
    <div className="flex items-center justify-between px-1"><div><p className="text-sm font-semibold">Suas salas</p><p className="text-xs text-muted-foreground">{rooms.length} espaço{rooms.length===1?"":"s"}</p></div><UsersRound className="size-5 text-primary"/></div>
    <form className="space-y-2" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);onCreate(String(form.get("name")??""),form.get("kind")==="classroom"?"classroom":"study");event.currentTarget.reset();}}>
      <Input name="name" aria-label="Nome da nova sala" placeholder="Nova sala" minLength={2} required/>
      <div className="flex gap-2"><select name="kind" aria-label="Tipo da sala" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm"><option value="study">Grupo de estudo</option><option value="classroom">Turma</option></select><Button size="sm" disabled={busy}><Plus/>Criar</Button></div>
    </form>
    <div className="space-y-1" aria-label="Lista de salas">{rooms.map((room)=><button key={room.id} type="button" onClick={()=>onSelect(room.id)} className={cn("flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",selectedId===room.id?"bg-accent text-accent-foreground":"hover:bg-accent/60")}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{room.kind==="classroom"?<GraduationCap className="size-4"/>:<UsersRound className="size-4"/>}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{room.name}</span><span className="text-xs text-muted-foreground">{room.kind==="classroom"?"Turma":"Sala de estudo"}</span></span></button>)}</div>
    {rooms.length===0&&<p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Crie uma sala ou entre com um convite.</p>}
    <form className="space-y-2 border-t pt-4" onSubmit={(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);onJoin(String(form.get("token")??""));}}><Input name="token" aria-label="Link ou token do convite" placeholder="Cole o convite" required/><Button type="submit" variant="outline" className="w-full" disabled={busy}><DoorOpen/>Entrar por convite</Button></form>
  </aside>;
}
