"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Bot, Calendar, House, Library, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/hooks/use-layout-store";

const items = [
  { href: "/", label: "Início", icon: House },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/estudo", label: "Estudo", icon: BookOpen },
  { href: "/provas", label: "Provas", icon: Calendar },
  { href: "/tutor", label: "Tutor", icon: Bot },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  const menuOpen = useLayoutStore((state) => state.menuOpen);
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);

  const isPrimaryActive = items.some(({ href }) =>
    href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/")
  );
  const isSecondaryActive = !isPrimaryActive && pathname !== "";

  return (
    <nav
      aria-label="Navegação rápida"
      className="mobile-navigation fixed inset-x-2 bottom-2 z-30 grid grid-cols-6 rounded-2xl border bg-background/92 px-1 pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-floating)] backdrop-blur-2xl lg:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              active && "bg-accent/70 text-primary"
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate px-0.5 text-center text-xs">{label}</span>
            {active && <span className="absolute bottom-1.5 h-0.5 w-5 rounded-full bg-primary" aria-hidden="true" />}
          </Link>
        );
      })}
      <button
        type="button"
        id="mobile-navigation-more"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Mais opções de navegação"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-current={isSecondaryActive ? "page" : undefined}
        className={cn(
          "relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          (isSecondaryActive || menuOpen) && "bg-accent/70 text-primary"
        )}
      >
        <Menu className="size-5 shrink-0" aria-hidden="true" />
        <span className="max-w-full truncate px-0.5 text-center text-xs">Mais</span>
        {(isSecondaryActive || menuOpen) && (
          <span className="absolute bottom-1.5 h-0.5 w-5 rounded-full bg-primary" aria-hidden="true" />
        )}
      </button>
    </nav>
  );
}
