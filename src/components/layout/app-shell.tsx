import { Header } from "./header";
import { Sidebar } from "./sidebar";

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
      <div className="min-w-0 flex-1">
        <Header />
        <main
          id="conteudo"
          tabIndex={-1}
          className="page-enter mx-auto w-full max-w-[1440px] px-5 py-8 outline-none sm:px-8 sm:py-10 lg:px-10 xl:px-14"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
