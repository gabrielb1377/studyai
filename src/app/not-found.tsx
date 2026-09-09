import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Vamos encontrar seu caminho?"
      description="Esta página não está por aqui. Volte ao seu espaço para continuar."
    >
      <Button asChild>
        <Link href="/">Ir para o Dashboard</Link>
      </Button>
    </EmptyState>
  );
}
