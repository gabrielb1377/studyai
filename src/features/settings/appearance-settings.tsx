"use client";

import { useSyncExternalStore } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
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
    <Card className="max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Aparência</CardTitle>
        <CardDescription>
          Escolha o tema mais confortável para você.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mounted ? theme : "light"} onValueChange={setTheme}>
          <TabsList aria-label="Tema da interface" className="h-12 w-full">
            <TabsTrigger value="light" className="min-h-10 flex-1">
              <Sun className="size-4" />
              Claro
            </TabsTrigger>
            <TabsTrigger value="dark" className="min-h-10 flex-1">
              <Moon className="size-4" />
              Escuro
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
