"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Bot, Calendar, House, Library } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Início", icon: House },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/estudo", label: "Estudo", icon: BookOpen },
  { href: "/provas", label: "Provas", icon: Calendar },
  { href: "/tutor", label: "Tutor", icon: Bot },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação rápida" className="mobile-navigation fixed inset-x-2 bottom-2 z-30 grid grid-cols-5 rounded-2xl border bg-background/92 px-1 pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-floating)] backdrop-blur-2xl lg:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring", active && "bg-accent/70 text-primary")}><Icon className="size-5" aria-hidden="true" /><span>{label}</span>{active && <span className="absolute bottom-1.5 h-0.5 w-5 rounded-full bg-primary" aria-hidden="true" />}</Link>;
      })}
    </nav>
  );
}
