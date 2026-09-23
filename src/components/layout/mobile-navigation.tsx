"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Bot, House, Library } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Início", icon: House },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/estudo", label: "Estudo", icon: BookOpen },
  { href: "/tutor", label: "Tutor", icon: Bot },
] as const;

export function MobileNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação rápida" className="mobile-navigation fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium text-muted-foreground", active && "text-primary")}><Icon className="size-5" /><span>{label}</span></Link>;
      })}
    </nav>
  );
}
