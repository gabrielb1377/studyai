"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Download, FolderOpen, HardDrive, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CacheManager } from "@/features/platform/CacheManager";
import { DesktopManager } from "@/features/platform/DesktopManager";
import { DeviceManager } from "@/features/platform/DeviceManager";
import { NotificationService } from "@/features/platform/NotificationService";
import { PWAService } from "@/features/platform/PWAService";
import { UpdateManager } from "@/features/platform/UpdateManager";
import type { PlatformCacheReport, PlatformPreferences } from "@/features/platform/types";

const STORAGE_KEY = "studyai:platform-settings";
const defaults: PlatformPreferences = { launchAtStartup: false, minimizeToTray: true, defaultFolder: "", autoDownload: false, wifiOnly: true, batterySaver: true, cacheLimitMb: 1024, notifications: false };

function size(value: number) {
  if (!value) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(value > 1024 ** 3 ? 1 : 0)} MB`;
}

export function PlatformSettings() {
  const [preferences, setPreferences] = useState(defaults);
  const [cache, setCache] = useState<PlatformCacheReport>();
  const [feedback, setFeedback] = useState("");
  const [installable, setInstallable] = useState(false);
  const [mounted, setMounted] = useState(false);
  const profile = mounted ? DeviceManager.detect() : undefined;

  const refreshCache = useCallback(() => void CacheManager.report().then(setCache), []);
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setPreferences({ ...defaults, ...JSON.parse(stored) as Partial<PlatformPreferences> }); } catch { /* mantém padrões seguros */ }
    }
    setInstallable(PWAService.canInstall());
    const onInstallable = () => setInstallable(true);
    window.addEventListener("studyai:pwa-installable", onInstallable);
    setMounted(true);
    refreshCache();
    return () => window.removeEventListener("studyai:pwa-installable", onInstallable);
  }, [refreshCache]);

  function save(changes: Partial<PlatformPreferences>) {
    setPreferences((current) => {
      const next = { ...current, ...changes };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("studyai:workspace-updated"));
      return next;
    });
  }

  async function toggle(key: keyof PlatformPreferences, value: boolean) {
    if (key === "launchAtStartup") await DesktopManager.setLaunchAtStartup(value);
    if (key === "minimizeToTray") await DesktopManager.setMinimizeToTray(value);
    if (key === "notifications" && value) {
      const granted = await NotificationService.permission();
      if (granted !== "granted") { setFeedback("As notificações foram bloqueadas pelo sistema."); return; }
    }
    save({ [key]: value });
  }

  if (!mounted || !profile) return null;
  const desktop = profile.kind === "electron";
  const mobile = profile.kind === "android" || profile.kind === "ios";

  return (
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="size-4" />Aplicativo e dispositivo</CardTitle>
        <CardDescription>{profile.name}. Preferências salvas e sincronizadas automaticamente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {desktop && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-semibold">Desktop</p>
            <SettingToggle label="Iniciar com o Windows" checked={preferences.launchAtStartup} onChange={(value) => void toggle("launchAtStartup", value)} />
            <SettingToggle label="Minimizar para a bandeja" checked={preferences.minimizeToTray} onChange={(value) => void toggle("minimizeToTray", value)} />
            <div className="flex gap-2">
              <Input value={preferences.defaultFolder} readOnly placeholder="Pasta padrão de materiais" />
              <Button type="button" variant="outline" onClick={() => void DesktopManager.selectDefaultFolder().then((folder) => folder && save({ defaultFolder: folder }))}><FolderOpen />Escolher</Button>
            </div>
          </div>
        )}
        {mobile && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-semibold">Mobile</p>
            <SettingToggle label="Baixar somente no Wi-Fi" checked={preferences.wifiOnly} onChange={(value) => void toggle("wifiOnly", value)} />
            <SettingToggle label="Economia de bateria" checked={preferences.batterySaver} onChange={(value) => void toggle("batterySaver", value)} />
            <SettingToggle label="Downloads automáticos" checked={preferences.autoDownload} onChange={(value) => void toggle("autoDownload", value)} />
          </div>
        )}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="size-4" />Armazenamento offline</p><p className="mt-1 text-xs text-muted-foreground">{size(cache?.usageBytes ?? 0)} utilizados · cache {size(cache?.cacheBytes ?? 0)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => void CacheManager.clearRuntime().then((count) => { setFeedback(`${count} caches temporários removidos.`); refreshCache(); })}>Limpar cache</Button></div>
          <SettingToggle label="Downloads automáticos" checked={preferences.autoDownload} onChange={(value) => void toggle("autoDownload", value)} />
          <SettingToggle label="Lembretes e notificações" checked={preferences.notifications} onChange={(value) => void toggle("notifications", value)} icon={<Bell className="size-4" />} />
        </div>
        <div className="flex flex-wrap gap-2">
          {installable && <Button type="button" onClick={() => void PWAService.install().then((installed) => setFeedback(installed ? "StudyAI instalado." : "Instalação cancelada."))}><Download />Instalar aplicativo</Button>}
          <Button type="button" variant="outline" onClick={() => void UpdateManager.check().then((result) => setFeedback(result.status === "available" ? "Atualização disponível." : result.status === "error" ? result.message || "Não foi possível verificar atualizações." : result.status === "development" ? "Atualizações automáticas ficam ativas no aplicativo instalado." : "Você está na versão mais recente."))}><RefreshCw />Verificar atualizações</Button>
          <Button type="button" variant="outline" onClick={() => void NotificationService.notify({ title: "StudyAI", body: "As notificações estão funcionando.", tag: "settings-test" }).then((shown) => setFeedback(shown ? "Notificação de teste enviada." : "Notificações indisponíveis."))}><Bell />Testar notificação</Button>
        </div>
        {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
      </CardContent>
    </Card>
  );
}

function SettingToggle({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange(value: boolean): void; icon?: React.ReactNode }) {
  return <label className="flex min-h-11 items-center justify-between gap-4 text-sm"><span className="flex items-center gap-2">{icon}{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-primary" /></label>;
}
