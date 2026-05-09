import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/history")({ component: HistoryPage });

type LogRow = Database["public"]["Tables"]["message_send_logs"]["Row"];
type LogWithRefs = LogRow & {
  instances: { name: string; units: { name: string } | null } | null;
  messages: { name: string } | null;
};

function HistoryPage() {
  const { data = [], isLoading } = useQuery<LogWithRefs[]>({
    queryKey: ["all-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*, instances(name, units(name)), messages(name)")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LogWithRefs[];
    },
  });

  return (
    <AppLayout title="Histórico">
      <p className="text-muted-foreground mb-4">Todos os envios registrados (últimos 500).</p>
      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Quando</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Instância</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>Carregando...</TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum envio registrado
                </TableCell>
              </TableRow>
            ) : (
              data.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(log.sent_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {log.instances?.units?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {log.instances?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.messages?.name ?? (
                      <span className="text-muted-foreground italic">Livre</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.number}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-md">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="truncate cursor-default">{log.text}</div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="start"
                        className="max-w-md whitespace-pre-wrap break-words bg-popover text-popover-foreground border border-border shadow-lg p-3 text-sm"
                      >
                        {log.text}
                        {log.error && (
                          <div className="mt-2 pt-2 border-t border-border text-destructive text-xs">
                            Erro: {log.error}
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {log.success ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      >
                        Enviada
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-destructive/15 text-destructive border-destructive/30"
                      >
                        Falhou
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
