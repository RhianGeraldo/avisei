import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/messages")({ component: MessagesPage });

const TRIGGER_LABELS: Record<string, string> = {
  appointment_reminder: "Lembrete de agendamento",
  appointment_confirmation: "Confirmação de agendamento",
  installment_due: "Parcela a vencer",
  installment_overdue: "Parcela em atraso",
  custom: "Personalizado",
};

function MessagesPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["all-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, units(id, name), instances(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppLayout title="Mensagens">
      <p className="text-muted-foreground mb-4">Todas as mensagens cadastradas. Para criar, abra a unidade correspondente.</p>
      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Gatilho</TableHead>
              <TableHead>Quando</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7}>Carregando...</TableCell></TableRow>
              : data.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma mensagem cadastrada</TableCell></TableRow>
              : data.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.units?.name ?? "—"}</TableCell>
                  <TableCell>{TRIGGER_LABELS[m.trigger_type]}</TableCell>
                  <TableCell className="text-muted-foreground">{m.days_offset === 0 ? "No dia" : `${m.days_offset > 0 ? "+" : ""}${m.days_offset}d`} às {m.send_time?.slice(0,5)}</TableCell>
                  <TableCell className="text-muted-foreground">{m.instances?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={m.active ? "default" : "secondary"}>{m.active ? "Ativa" : "Inativa"}</Badge></TableCell>
                  <TableCell>
                    {m.units?.id && <Button size="icon" variant="ghost" asChild><Link to="/units/$unitId" params={{ unitId: m.units.id }}><ExternalLink className="h-4 w-4" /></Link></Button>}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
