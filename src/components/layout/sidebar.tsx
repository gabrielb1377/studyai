"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Leaf } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLayoutStore } from "@/hooks/use-layout-store";
import { navigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function SidebarContent() {
  const pathname = usePathname();
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);

  return (
    <div className="flex h-full flex-col px-4 py-7">
      <Link
        href="/"
        onClick={() => setMenuOpen(false)}
        className="mb-10 flex w-fit items-center gap-2.5 px-3 text-xl font-semibold tracking-tight"
        aria-label="StudyAI — Dashboard"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BookOpen className="size-5" aria-hidden="true" />
        </span>
        Study<span className="-ml-2 text-primary">AI</span>
      </Link>
      <div className="mb-8 flex items-center gap-3 rounded-xl border bg-card/70 px-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground">
          ME
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Meu espaço</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Workspace pessoal
          </p>
        </div>
      </div>
      <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
        SEU WORKSPACE
      </p>
      <nav aria-label="Navegação principal" className="space-y-1.5">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              pathname === href
                ? "bg-accent font-semibold text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
            {pathname === href && (
              <span className="ml-auto size-1.5 rounded-full bg-primary" />
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto px-3 pt-12">
        <Leaf className="mb-3 size-5 text-primary/70" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Pequenos passos.
          <br />
          Grandes descobertas.
        </p>
        <div className="mt-6 border-t pt-4 text-[11px] text-muted-foreground">
          StudyAI <span className="mx-1">·</span> Seu ritmo, seu espaço.
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const menuOpen = useLayoutStore((state) => state.menuOpen);
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r bg-sidebar lg:block">
        <SidebarContent />
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
            Acesse as seis áreas do seu workspace.
          </DialogDescription>
          <SidebarContent />
        </DialogContent>
      </Dialog>
    </>
  );
}
