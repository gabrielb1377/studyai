"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Cloud, Moon, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthAccessForm, type AuthAccessMode } from "./AuthAccessForm";
import { useAuth } from "./AuthProvider";

const OFFLINE_SESSION_KEY = "studyai:offline-session";

export function AppEntryGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [mode, setMode] = useState<AuthAccessMode | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    setOffline(localStorage.getItem(OFFLINE_SESSION_KEY) === "active");
  }, []);

  if (pathname !== "/" || auth.session || offline) return children;

  if (auth.isLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-background"><div className="text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><BookOpen className="size-7" /></span><p className="mt-4 text-sm font-medium">Preparando seu espaço de estudos…</p><span className="mx-auto mt-3 block h-1 w-28 overflow-hidden rounded-full bg-muted"><span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" /></span></div></div>;
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/.13),transparent_34%),radial-gradient(circle_at_bottom_right,hsl(var(--primary)/.08),transparent_32%)]" />
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <Card className="relative w-full max-w-lg border-primary/15 bg-card/92 shadow-2xl backdrop-blur-xl">
        <CardHeader className="items-center pb-2 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><BookOpen className="size-7" /></span>
          <h1 className="text-3xl font-semibold tracking-tight">StudyAI</h1>
          <CardDescription className="max-w-sm text-sm leading-6">Organize seus materiais, estude com contexto e acompanhe sua evolução em um único workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <Button size="lg" className="w-full" onClick={() => setMode("login")}><Cloud />Entrar</Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => setMode("register")}><Sparkles />Criar conta</Button>
          <Button size="lg" variant="ghost" className="w-full" onClick={() => { localStorage.setItem(OFFLINE_SESSION_KEY, "active"); setOffline(true); }}><WifiOff />Continuar offline</Button>
          <Button size="sm" variant="link" className="w-full" onClick={() => setAboutOpen(true)}>Sobre o StudyAI</Button>
          <div className="border-t pt-4 text-center text-xs leading-5 text-muted-foreground"><Moon className="mr-1 inline size-3.5" />Seus dados locais permanecem neste dispositivo. Uma conta habilita sincronização e colaboração.</div>
        </CardContent>
      </Card>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>{mode === "register" ? "Criar sua conta" : "Entrar no StudyAI"}</DialogTitle>
          <DialogDescription>{mode === "register" ? "Crie seu perfil e escolha como deseja estudar." : "Continue exatamente de onde parou."}</DialogDescription>
          {mode && <AuthAccessForm mode={mode} onModeChange={setMode} onComplete={(completedMode) => { setMode(null); if (completedMode === "register") router.replace("/?onboarding=1"); }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}><DialogContent className="max-w-lg"><DialogTitle>Sobre o StudyAI</DialogTitle><DialogDescription>Um workspace pessoal e offline-first para organizar materiais, estudar com contexto e acompanhar sua aprendizagem.</DialogDescription><div className="space-y-3 text-sm leading-6 text-muted-foreground"><p>Importe seus próprios materiais, navegue pela estrutura de estudos criada localmente e use as ferramentas integradas no mesmo ambiente.</p><p>Você pode começar sem conta. Ao entrar, sincronização e colaboração ficam disponíveis conforme a infraestrutura configurada.</p></div></DialogContent></Dialog>
    </main>
  );
}
