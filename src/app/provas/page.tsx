import type { Metadata } from "next";
import { ProvasClient } from "./ProvasClient";

export const metadata: Metadata = { title: "Modo Semana de Prova" };

export default function ProvasPage() {
  return <ProvasClient />;
}
