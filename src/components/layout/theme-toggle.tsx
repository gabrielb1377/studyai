"use client";

import { Moon, MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const cycleTheme = () => {
    setTheme(theme === "amoled" || resolvedTheme === "dark" ? "light" : "dark");
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Alternar tema claro/escuro"
          onClick={cycleTheme}
        >
          <Sun className="size-[18px] dark:hidden" />
          <Moon className="hidden size-[18px] dark:block amoled:hidden" />
          <MoonStar className="hidden size-[18px] amoled:block" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Alternar entre claro, escuro e AMOLED</TooltipContent>
    </Tooltip>
  );
}
