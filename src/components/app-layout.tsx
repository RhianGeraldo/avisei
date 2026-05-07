import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthGuard } from "@/components/auth-guard";

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <header className="h-14 flex items-center gap-3 border-b border-border px-4 glass sticky top-0 z-10">
              <SidebarTrigger />
              {title && <h1 className="text-lg font-display font-semibold">{title}</h1>}
            </header>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
