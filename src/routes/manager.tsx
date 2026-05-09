import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Calendar, Send, Ban, Trash2, History, Clock, FilterX, RefreshCw, AlertCircle } from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { dispatchSendQueueItem, cancelSendQueueItem } from "@/lib/evogo";
import { fetchBelleAgendamentos, enqueueBelleAgendamentos } from "@/lib/belle";

export const Route = createFileRoute("/manager")({ component: ManagerPage });

type QueueStatus = Database["public"]["Enums"]["send_queue_status"];
type QueueRow = Database["public"]["Tables"]["send_queue"]["Row"];
type QueueWithRefs = QueueRow & {
  units: { id: string; name: string } | null;
  messages: { name: string } | null;
  instances: { name: string } | null;
};
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type LogRow = Database["public"]["Tables"]["message_send_logs"]["Row"];
type LogWithRefs = LogRow & {
  instances: { name: string; units: { name: string } | null } | null;
  messages: { name: string } | null;
};

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const STATUS_CLASSES: Record<QueueStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function QueueTable({
  rows,
  isLoading,
  emptyMsg,
  showActions,
  onDispatch,
  onCancel,
  onRetry,
}: {
  rows: QueueWithRefs[];
  isLoading: boolean;
  emptyMsg: string;
  showActions: boolean;
  onDispatch?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const colSpan = showActions ? 7 : 6;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Unidade</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Número</TableHead>
          <TableHead>Mensagem</TableHead>
          <TableHead>Instância</TableHead>
          <TableHead className="w-24">Status</TableHead>
          {showActions && <TableHead className="w-32 text-right">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={colSpan}>Carregando...</TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
              {emptyMsg}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="text-muted-foreground">{q.units?.name ?? "—"}</TableCell>
              <TableCell>
                <div className="text-sm">{q.cliente_nome ?? "—"}</div>
                {q.agendamento_data &&
                  typeof q.agendamento_data === "object" &&
                  !Array.isArray(q.agendamento_data) && (
                    <div className="text-xs text-muted-foreground">
                      {String((q.agendamento_data as Record<string, unknown>).dtAgenda ?? "")}{" "}
                      {String((q.agendamento_data as Record<string, unknown>).hrConsulta ?? "")}
                    </div>
                  )}
              </TableCell>
              <TableCell className="font-mono text-xs">{q.number}</TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-xs">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate cursor-default">{q.text}</div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    className="max-w-md whitespace-pre-wrap break-words bg-popover text-popover-foreground border border-border shadow-lg p-3 text-sm"
                  >
                    {q.text}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{q.instances?.name ?? "—"}</TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={`${STATUS_CLASSES[q.status]} cursor-default`}>
                      {q.status === "failed" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {STATUS_LABELS[q.status]}
                    </Badge>
                  </TooltipTrigger>
                  {q.status === "failed" && (
                    <TooltipContent side="top" align="start" className="max-w-xs bg-destructive text-destructive-foreground border border-destructive/30 p-2 text-xs">
                      <div className="font-semibold mb-1">Falha no envio:</div>
                      <div>{q.last_error || "Erro desconhecido"}</div>
                      <div className="mt-2 text-[10px] opacity-70 italic">Clique no ícone de girar para retentar</div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  {q.status === "pending" && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Enviar agora"
                        onClick={() => onDispatch?.(q.id)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="icon" variant="ghost" title="Cancelar">
                            <Ban className="h-4 w-4" />
                          </Button>
                        }
                        title="Cancelar item?"
                        description="O item será marcado como cancelado e não será enviado."
                        onConfirm={() => onCancel?.(q.id)}
                      />
                    </>
                  )}
                  {q.status === "failed" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Tentar novamente"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => onRetry?.(q.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Tentar novamente</TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function ManagerPage() {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: units = [] } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: messages = [] } = useQuery<MessageRow[]>({
    queryKey: ["all-messages-for-manager"],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").order("name");
      return (data ?? []) as MessageRow[];
    },
  });

  const { data: instances = [] } = useQuery<InstanceRow[]>({
    queryKey: ["all-instances-for-manager"],
    queryFn: async () => {
      const { data } = await supabase.from("instances").select("*").order("name");
      return (data ?? []) as InstanceRow[];
    },
  });

  // Pending + Failed
  const { data: pendingQueue = [], isLoading: loadingPending } = useQuery<QueueWithRefs[]>({
    queryKey: ["queue-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_queue")
        .select("*, units(id, name), messages(name), instances(name)")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as QueueWithRefs[];
    },
    refetchInterval: 10000,
  });

  // History (message_send_logs)
  const [histDateFrom, setHistDateFrom] = useState(today);
  const [histDateTo, setHistDateTo] = useState(today);

  const { data: historyLogs = [], isLoading: loadingHistory } = useQuery<LogWithRefs[]>({
    queryKey: ["logs-history", histDateFrom, histDateTo],
    queryFn: async () => {
      if (!histDateFrom || !histDateTo) return [];
      const from = startOfDay(parseISO(histDateFrom)).toISOString();
      const to = endOfDay(parseISO(histDateTo)).toISOString();
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*, instances(name, units(name)), messages(name)")
        .gte("sent_at", from)
        .lte("sent_at", to)
        .order("sent_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as LogWithRefs[];
    },
  });

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importUnit, setImportUnit] = useState("");
  const [importTemplate, setImportTemplate] = useState("");
  const [importInstance, setImportInstance] = useState("");
  const [importDtInicio, setImportDtInicio] = useState("");
  const [importDtFim, setImportDtFim] = useState("");
  const [importStatus, setImportStatus] = useState("any");
  const [importTipo, setImportTipo] = useState("any");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setImportTemplate("");
    setImportInstance("");
  }, [importUnit]);

  const availableMessages = importUnit
    ? messages.filter((m) => m.unit_ids.length === 0 || m.unit_ids.includes(importUnit))
    : [];
  const availableInstances = importUnit ? instances.filter((i) => i.unit_id === importUnit) : [];

  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUnit || !importTemplate || !importInstance || !importDtInicio || !importDtFim) {
      toast.error("Preencha unidade, template, instância e período");
      return;
    }
    setImporting(true);
    try {
      const toBelle = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
      };
      const fetchInput: Record<string, unknown> = {
        unitId: importUnit,
        dtInicio: toBelle(importDtInicio),
        dtFim: toBelle(importDtFim),
      };
      if (importStatus !== "any") fetchInput.status = importStatus;
      if (importTipo !== "any") fetchInput.tipoAgendamento = importTipo;

      const result = await fetchBelleAgendamentos({ data: fetchInput });
      const comCelular = result.agendamentos.filter((a) => a.cliente.celular);
      if (comCelular.length === 0) {
        toast.error(
          `Nenhum agendamento com celular encontrado (${result.total} no período, ${result.semCelular} sem celular).`,
        );
        return;
      }

      const items = comCelular.map((a) => ({
        codConsulta: a.codConsulta,
        messageId: importTemplate,
        number: a.cliente.celular!,
        cliente: { cod: a.cliente.cod, nome: a.cliente.nome },
        dtAgenda: a.dtAgenda,
        hrConsulta: a.hrConsulta,
        profNome: a.prof.nome,
        servicos: a.servicos.map((s) => s.nome),
      }));

      const enq = await enqueueBelleAgendamentos({
        data: { unitId: importUnit, instanceId: importInstance, items },
      });
      const extras: string[] = [];
      if (result.semCelular > 0) extras.push(`${result.semCelular} sem celular`);
      if (enq.merged > 0) extras.push(`${enq.merged} agendamentos combinados em mensagens únicas`);
      toast.success(
        `${enq.count} mensagens adicionadas à fila${extras.length ? ` — ${extras.join("; ")}` : ""}`,
      );
      setImportOpen(false);
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setImporting(false);
    }
  };

  const dispatchQueue = async (id: string) => {
    try {
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    }
  };

  const cancelQueue = async (id: string) => {
    try {
      await cancelSendQueueItem({ data: { itemId: id } });
      toast.success("Item cancelado");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar");
    }
  };

  const retryQueue = async (id: string) => {
    try {
      // Reset to pending first
      const { error: updateErr } = await supabase
        .from("send_queue")
        .update({ status: "pending", last_error: null })
        .eq("id", id);
      if (updateErr) throw new Error(updateErr.message);
      // Then dispatch immediately
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Mensagem reenviada com sucesso!");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao retentar");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    }
  };

  const clearPending = async () => {
    try {
      const ids = pendingQueue.map((q) => q.id);
      if (ids.length === 0) return;
      const { error } = await supabase.from("send_queue").delete().in("id", ids);
      if (error) throw new Error(error.message);
      toast.success("Fila limpa");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao limpar fila");
    }
  };

  return (
    <AppLayout title="Gerenciador">
      <Tabs defaultValue="pending" className="space-y-4">
        {/* Toolbar */}
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendentes
              {pendingQueue.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {pendingQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="outline" disabled={pendingQueue.length === 0}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar fila
                </Button>
              }
              title="Limpar fila de pendentes?"
              description="Todos os itens pendentes serão removidos permanentemente."
              onConfirm={clearPending}
            />
            <Button onClick={() => setImportOpen(true)} disabled={units.length === 0}>
              <Calendar className="h-4 w-4 mr-1" />
              Importar do Belle
            </Button>
          </div>
        </div>

        {/* Pendentes */}
        <TabsContent value="pending">
          <Card className="glass">
            <QueueTable
              rows={pendingQueue}
              isLoading={loadingPending}
              emptyMsg="Nenhum item pendente na fila"
              showActions
              onDispatch={dispatchQueue}
              onCancel={cancelQueue}
              onRetry={retryQueue}
            />
          </Card>
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="history" className="space-y-4">
          {/* Date filter bar */}
          <Card className="glass p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="justify-start font-normal w-36">
                      <Calendar className="h-3.5 w-3.5 mr-2 opacity-60" />
                      {histDateFrom
                        ? format(parseISO(histDateFrom), "dd/MM/yyyy", { locale: ptBR })
                        : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <CalendarPicker
                      mode="single"
                      locale={ptBR}
                      selected={histDateFrom ? parseISO(histDateFrom) : undefined}
                      onSelect={(d) => setHistDateFrom(d ? format(d, "yyyy-MM-dd") : "")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="justify-start font-normal w-36">
                      <Calendar className="h-3.5 w-3.5 mr-2 opacity-60" />
                      {histDateTo
                        ? format(parseISO(histDateTo), "dd/MM/yyyy", { locale: ptBR })
                        : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <CalendarPicker
                      mode="single"
                      locale={ptBR}
                      selected={histDateTo ? parseISO(histDateTo) : undefined}
                      onSelect={(d) => setHistDateTo(d ? format(d, "yyyy-MM-dd") : "")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setHistDateFrom(today);
                  setHistDateTo(today);
                }}
              >
                <FilterX className="h-4 w-4 mr-1" />
                Hoje
              </Button>

              <p className="text-xs text-muted-foreground ml-auto self-center">
                {historyLogs.length} registro(s)
              </p>
            </div>
          </Card>

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
                {loadingHistory ? (
                  <TableRow>
                    <TableCell colSpan={7}>Carregando...</TableCell>
                  </TableRow>
                ) : historyLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum registro encontrado no período
                    </TableCell>
                  </TableRow>
                ) : (
                  historyLogs.map((log) => (
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
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                            Enviada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
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
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Importar agendamentos do Belle
            </DialogTitle>
            <DialogDescription>
              Busca agendamentos do período e gera mensagens pendentes na fila.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitImport} className="space-y-4">
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={importUnit} onValueChange={setImportUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={importTemplate} onValueChange={setImportTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMessages.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Instância de envio</Label>
                <Select value={importInstance} onValueChange={setImportInstance}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInstances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start font-normal">
                      <Calendar className="h-4 w-4 mr-2" />
                      {importDtInicio
                        ? format(parseISO(importDtInicio), "dd/MM/yyyy", { locale: ptBR })
                        : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <CalendarPicker
                      mode="single"
                      locale={ptBR}
                      selected={importDtInicio ? parseISO(importDtInicio) : undefined}
                      onSelect={(d) => setImportDtInicio(d ? format(d, "yyyy-MM-dd") : "")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Data fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start font-normal">
                      <Calendar className="h-4 w-4 mr-2" />
                      {importDtFim
                        ? format(parseISO(importDtFim), "dd/MM/yyyy", { locale: ptBR })
                        : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-auto" align="start">
                    <CalendarPicker
                      mode="single"
                      locale={ptBR}
                      selected={importDtFim ? parseISO(importDtFim) : undefined}
                      onSelect={(d) => setImportDtFim(d ? format(d, "yyyy-MM-dd") : "")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={importStatus} onValueChange={setImportStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Todos</SelectItem>
                    <SelectItem value="Marcado">Marcado</SelectItem>
                    <SelectItem value="Confirmado">Confirmado</SelectItem>
                    <SelectItem value="Aguardando">Aguardando</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Antecipado">Antecipado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={importTipo} onValueChange={setImportTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Todos</SelectItem>
                    <SelectItem value="Avaliação">Avaliação</SelectItem>
                    <SelectItem value="Serviço">Serviço</SelectItem>
                    <SelectItem value="Consulta">Consulta</SelectItem>
                    <SelectItem value="Retorno">Retorno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={importing}>
                {importing ? "Importando..." : "Importar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
