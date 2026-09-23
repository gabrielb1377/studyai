import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { SettingsHub } from "@/features/settings/SettingsHub";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Configurações"
        title="Do seu jeito."
        description="Pequenos ajustes para deixar seu espaço mais confortável."
      />
      <SettingsHub />
    </>
  );
}
