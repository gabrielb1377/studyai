"use client";

import Link from "next/link";
import { LogOut, Menu, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLayoutStore } from "@/hooks/use-layout-store";
import { SearchDialog } from "./search-dialog";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/features/account/AuthProvider";

export function Header() {
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);
  const { session, logout } = useAuth();
  return (
    <header className="app-header sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-xl sm:h-[68px] sm:px-6 lg:px-8">
      <Button
        id="navigation-toggle"
        variant="ghost"
        size="icon"
        className="size-11 lg:hidden"
        aria-label="Abrir menu"
        onClick={() => setMenuOpen(true)}
      >
        <Menu />
      </Button>
      <SearchDialog />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <div className="mx-1 h-5 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 rounded-full border bg-secondary text-secondary-foreground"
              aria-label="Abrir menu pessoal"
            >
              <UserRound className="size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{session?.user.profile?.name ?? "Meu espaço pessoal"}{session?.user.email && <span className="mt-0.5 block max-w-44 truncate text-xs font-normal text-muted-foreground">{session.user.email}</span>}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/conta"><UserRound className="size-4" />Conta e sincronização</Link></DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">
                <Settings className="size-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
            {session && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => { void logout(); }}><LogOut className="size-4" />Sair</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
