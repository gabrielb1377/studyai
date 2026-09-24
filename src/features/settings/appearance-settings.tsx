"use client";

import { useSyncExternalStore } from "react";
import { Laptop, Moon, MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const subscribe = () => () => {};

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Aparência</CardTitle>
        <CardDescription>
          Escolha o tema mais confortável para você.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mounted ? theme : "light"} onValueChange={setTheme}>
          <TabsList aria-label="Tema da interface" className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
            <TabsTrigger value="light" className="min-h-10 flex-1">
              <Sun className="size-4" />
              Claro
            </TabsTrigger>
            <TabsTrigger value="dark" className="min-h-10 flex-1">
              <Moon className="size-4" />
              Escuro
            </TabsTrigger>
            <TabsTrigger value="amoled" className="min-h-10 flex-1">
              <MoonStar className="size-4" />
              AMOLED
            </TabsTrigger>
            <TabsTrigger value="system" className="min-h-10 flex-1">
              <Laptop className="size-4" />
              Sistema
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Sua preferência é salva automaticamente neste navegador.
        </p>
      </CardContent>
    </Card>
  );
}
