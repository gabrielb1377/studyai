"use client";

import { useRef, useState } from "react";
import { Download, FileUp, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AuthClient } from "./AuthClient";
import { useAuth } from "./AuthProvider";
import { DataPortabilityService } from "./DataPortabilityService";

export function AccountDataControls() {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const exportData = async () => { setWorking(true); try { DataPortabilityService.download(await DataPortabilityService.exportArchive()); setStatus("Seus dados foram exportados."); } finally { setWorking(false); } };
  const importData = async (file?: File) => { if (!file) return; setWorking(true); try { await DataPortabilityService.importArchive(file); setStatus("Backup importado. Os dados foram mesclados com este dispositivo."); window.dispatchEvent(new Event("studyai:storage-updated")); } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível importar o backup."); } finally { setWorking(false); } };
  const logoutAll = async () => { setWorking(true); try { await AuthClient.request("/auth/sessions", { method: "DELETE" }); await auth.logout(); } finally { setWorking(false); } };
  const deleteAccount = async () => { if (confirmation !== "EXCLUIR") return; setWorking(true); try { await AuthClient.request("/auth/account", { method: "DELETE", body: JSON.stringify({ confirmation }) }); await DataPortabilityService.clearLocalData(); localStorage.removeItem("studyai:offline-session"); location.assign("/"); } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível excluir a conta."); setWorking(false); } };
  return <Card><CardHeader><CardTitle>Seus dados</CardTitle><CardDescription>Exporte, restaure ou encerre sua conta com confirmação explícita.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void exportData()} disabled={working}><Download />Exportar dados</Button><Button variant="outline" onClick={() => inputRef.current?.click()} disabled={working}><FileUp />Importar backup</Button><input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void importData(event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button variant="outline" onClick={() => void logoutAll()} disabled={working}><LogOut />Sair de todos os dispositivos</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={working}><Trash2 />Excluir conta</Button></div><p className="text-xs leading-5 text-muted-foreground">A exportação inclui os registros estruturados, as preferências e o layout do Workspace. Arquivos originais grandes armazenados no dispositivo ou no Object Storage não são incorporados ao JSON.</p>{status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>Excluir sua conta permanentemente?</DialogTitle><DialogDescription>Esta ação remove a conta e os dados sincronizados. Exporte seus dados antes de continuar. Digite EXCLUIR para confirmar.</DialogDescription></DialogHeader><Input aria-label="Confirmação para excluir conta" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} placeholder="EXCLUIR" /><DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button><Button variant="destructive" disabled={confirmation !== "EXCLUIR" || working} onClick={() => void deleteAccount()}>Excluir permanentemente</Button></DialogFooter></DialogContent></Dialog></CardContent></Card>;
}
