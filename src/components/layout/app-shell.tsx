import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { HelpCenter } from "@/features/help/HelpCenter";
import { Onboarding } from "@/features/help/Onboarding";
import { ContextualGuide } from "@/features/help/ContextualGuide";
import { MobileNavigation } from "./mobile-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#conteudo"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="min-w-0 flex-1 lg:pl-0">
        <Header />
        <main
          id="conteudo"
          tabIndex={-1}
          className="app-main page-enter mx-auto w-full max-w-[1560px] px-4 pb-24 pt-5 outline-none sm:px-6 sm:pb-24 sm:pt-7 lg:px-8 lg:pb-10 xl:px-10 2xl:px-12"
        >
          {children}
        </main>
      </div>
      <ContextualGuide />
      <HelpCenter />
      <Onboarding />
      <MobileNavigation />
    </div>
  );
}
