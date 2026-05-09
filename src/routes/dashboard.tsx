import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Store, Smartphone, MessageSquareMore, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  const { user, roles, companyId } = useAuth();
  const isSuper = roles.includes("super_admin");

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [companies, units, instances, messages] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("units").select("id", { count: "exact", head: true }),
        supabase.from("instances").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
      ]);
      return {
        companies: companies.count ?? 0,
        units: units.count ?? 0,
        instances: instances.count ?? 0,
        messages: messages.count ?? 0,
      };
    },
  });

  const cards = [
    ...(isSuper
      ? [{ label: "Empresas", value: stats?.companies ?? 0, icon: Building2, link: "/companies" }]
      : []),
    { label: "Unidades", value: stats?.units ?? 0, icon: Store, link: "/units" },
    { label: "Instâncias", value: stats?.instances ?? 0, icon: Smartphone, link: "/units" },
    { label: "Mensagens", value: stats?.messages ?? 0, icon: MessageSquareMore, link: "/messages" },
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-3xl font-bold">Bem-vindo 👋</h2>
          <p className="text-muted-foreground mt-1">
            {isSuper
              ? "Você é super admin — gerencie todas as empresas."
              : companyId
                ? "Visão geral da sua empresa."
                : "Sua conta ainda não está vinculada a uma empresa. Peça para um admin associá-la."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className="glass hover:border-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
                <c.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold">{c.value}</div>
                <Button variant="link" className="px-0 h-auto mt-2 text-xs" asChild>
                  <Link to={c.link}>
                    Gerenciar <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="font-display">Próximos passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="text-primary font-bold">1.</span> Cadastre uma{" "}
              <Link to="/units" className="text-primary hover:underline">
                unidade
              </Link>{" "}
              com o token Belle.
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold">2.</span> Configure uma instância Evogo na
              unidade.
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold">3.</span> Crie{" "}
              <Link to="/messages" className="text-primary hover:underline">
                mensagens
              </Link>{" "}
              com gatilhos e templates.
            </div>
            <div className="flex gap-3">
              <span className="text-muted-foreground/50 font-bold">4.</span>{" "}
              <span className="opacity-60">
                O cron e o envio via Evogo serão ativados na próxima versão.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
