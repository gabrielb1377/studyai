import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { AppearanceSettings } from "@/features/settings/appearance-settings";
import { AISettingsPanel } from "@/features/settings/ai-settings-panel";

export const metadata: Metadata = { title: "Configurações" };

export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Configurações"
        title="Do seu jeito."
        description="Pequenos ajustes para deixar seu espaço mais confortável."
      />
      <div className="space-y-5">
        <AppearanceSettings />
        <AISettingsPanel />
      </div>
    </>
  );
}
