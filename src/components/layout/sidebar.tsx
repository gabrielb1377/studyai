"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, Leaf, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLayoutStore } from "@/hooks/use-layout-store";
import { navigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";

function SidebarContent({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);
  const preferences = useExperiencePreferences();
  const items = navigation.filter((item) => !item.advanced || preferences.mode === "advanced");

  return (
    <div className="flex h-full flex-col px-3 py-5 sm:py-6">
      <Link
        href="/"
        onClick={() => setMenuOpen(false)}
        className={cn("mb-8 flex w-fit items-center gap-2.5 px-2 text-xl font-semibold tracking-[-0.04em]", compact && "mx-auto px-0")}
        aria-label="StudyAI — Dashboard"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        {!compact && <>Study<span className="-ml-2 text-primary">AI</span></>}
      </Link>
      <div className={cn("mb-7 flex items-center gap-3 rounded-2xl border bg-card/60 px-3 py-3 shadow-sm backdrop-blur-sm", compact && "justify-center px-1")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
          ME
        </span>
        {!compact && <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Meu espaço</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Workspace pessoal
          </p>
        </div>}
      </div>
      <p className={cn("mb-3 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground", compact && "sr-only")}>
        SEU WORKSPACE
      </p>
      <nav aria-label="Navegação principal" className="space-y-1.5">
        {items.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === href ? "page" : undefined}
            aria-label={compact ? label : undefined}
            title={compact ? `${label} — ${description}` : undefined}
            className={cn(
              "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-[color,background-color,transform] duration-150",
              compact && "justify-center px-2",
              pathname === href
                ? "bg-accent font-semibold text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-accent/55 hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {!compact && label}
            {pathname === href && !compact && (
              <span className="ml-auto size-1.5 rounded-full bg-primary" />
            )}
          </Link>
        ))}
      </nav>
      {!compact && <div className="mt-auto px-3 pt-12">
        <Leaf className="mb-3 size-5 text-primary/70" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pequenos passos.
          <br />
          Grandes descobertas.
        </p>
        <div className="mt-6 border-t pt-4 text-[11px] text-muted-foreground">
          StudyAI <span className="mx-1">·</span> Seu ritmo, seu espaço.
        </div>
      </div>}
    </div>
  );
}

export function Sidebar() {
  const menuOpen = useLayoutStore((state) => state.menuOpen);
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);
  const compact = useLayoutStore((state) => state.sidebarCompact);
  const setCompact = useLayoutStore((state) => state.setSidebarCompact);

  useEffect(() => {
    const saved = localStorage.getItem("studyai:sidebar-compact");
    setCompact(saved === null ? window.innerWidth < 1280 : saved === "true");
  }, [setCompact]);

  function toggleCompact() {
    const next = !compact;
    setCompact(next);
    localStorage.setItem("studyai:sidebar-compact", String(next));
    window.dispatchEvent(new Event("studyai:workspace-updated"));
  }

  return (
    <>
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 border-r bg-sidebar/92 backdrop-blur-xl transition-[width] duration-200 lg:block", compact ? "w-20" : "w-60")}>
        <SidebarContent compact={compact} />
        <button type="button" onClick={toggleCompact} className="absolute bottom-5 right-0 flex size-8 translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground" aria-label={compact ? "Expandir menu" : "Recolher menu"} title={compact ? "Expandir menu" : "Recolher menu"}>
          {compact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </aside>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          className="inset-y-0 left-0 h-dvh w-[min(85vw,280px)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-y-0 border-l-0 bg-sidebar p-0 sm:max-w-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("navigation-toggle")?.focus();
          }}
        >
          <DialogTitle className="sr-only">Menu de navegação</DialogTitle>
          <DialogDescription className="sr-only">
            Acesse as áreas do seu workspace.
          </DialogDescription>
          <SidebarContent />
        </DialogContent>
      </Dialog>
    </>
  );
}
