import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { ConnectivityBanner } from "./connectivity-banner";
import { HelpCenter } from "@/features/help/HelpCenter";
import { Onboarding } from "@/features/help/Onboarding";
import { ContextualGuide } from "@/features/help/ContextualGuide";
import { MobileNavigation } from "./mobile-navigation";
import { AppEntryGate } from "@/features/account/AppEntryGate";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppEntryGate><div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1 lg:pl-0">
        <Header />
        <ConnectivityBanner />
        <main
          id="conteudo"
          tabIndex={-1}
          className="app-main page-enter mx-auto w-full max-w-[1560px] px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-6 sm:pt-7 lg:px-8 lg:pb-10 xl:px-10 2xl:px-12"
        >
          {children}
        </main>
      </div>
      <ContextualGuide />
      <HelpCenter />
      <Onboarding />
      <MobileNavigation />
    </div></AppEntryGate>
  );
}
