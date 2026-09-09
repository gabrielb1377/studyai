"use client";

import Link from "next/link";
import { Menu, Settings, UserRound } from "lucide-react";
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

export function Header() {
  const setMenuOpen = useLayoutStore((state) => state.setMenuOpen);
  return (
    <header className="flex h-[76px] shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-7 lg:px-10">
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
            <DropdownMenuLabel>Meu espaço pessoal</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/configuracoes">
                <Settings className="size-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
