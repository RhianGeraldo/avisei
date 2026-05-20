"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
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
import { Calendar as CalendarIcon, Send, Ban, Trash2, History, Clock, FilterX, RefreshCw, AlertCircle, Loader2, MessageSquare, FileText, Image as ImageIcon, ListFilter, Video, Music, File as FileIcon } from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { dispatchSendQueueItem, cancelSendQueueItem, processQueueNow } from "@/lib/evogo";
import { fetchBelleAgendamentos, fetchBelleCobrancas, enqueueBelleItems } from "@/lib/belle";
import { cn } from "@/lib/utils";
import { MessagePreview } from "@/components/message-preview";

type QueueStatus = Database["public"]["Enums"]["send_queue_status"];
type QueueRow = Database["public"]["Tables"]["send_queue"]["Row"];
type QueueWithRefs = QueueRow & {
  units: { id: string; name: string } | null;
  messages: { 
    name: string; 
    message_type: string | null; 
    content_data: any; 
    template: string | null;
  } | null;
  instances: { name: string } | null;
};
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type LogRow = Database["public"]["Tables"]["message_send_logs"]["Row"];
type LogWithRefs = LogRow & {
  instances: { name: string; units: { name: string } | null } | null;
  messages: { 
    name: string; 
    message_type: string | null; 
    content_data: any; 
    template: string | null;
  } | null;
};

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
  paused: "Pausado",
  processing: "Processando",
};

const STATUS_CLASSES: Record<QueueStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  paused: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  processing: "bg-blue-500/15 text-blue-500 border-blue-500/30",
};

// Removido MessageContentPreview local em favor do MessagePreview compartilhado

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
          <TableHead className="px-6">Unidade</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Número</TableHead>
          <TableHead>Mensagem</TableHead>
          <TableHead>Instância</TableHead>
          <TableHead className="w-24">Status</TableHead>
          {showActions && <TableHead className="w-32 text-right px-6">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow><TableCell colSpan={colSpan} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-16">
              <div className="flex flex-col items-center gap-2 opacity-30">
                <Send className="h-12 w-12" />
                <p>{emptyMsg}</p>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="px-6 text-muted-foreground text-xs">{q.units?.name ?? "—"}</TableCell>
              <TableCell><div className="text-sm font-medium">{q.cliente_nome ?? "—"}</div></TableCell>
              <TableCell className="font-mono text-xs">{q.number}</TableCell>
              <TableCell className="text-muted-foreground text-xs max-w-xs">
                <MessagePreview text={q.text} message={q.messages} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{q.instances?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("text-[10px] uppercase font-bold", STATUS_CLASSES[q.status])}>
                  {STATUS_LABELS[q.status]}
                </Badge>
              </TableCell>
              {showActions && (
                <TableCell className="text-right px-6">
                  <div className="flex justify-end gap-1">
                    {q.status === "pending" && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDispatch?.(q.id)}><Send className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive" onClick={() => onCancel?.(q.id)}><Ban className="h-4 w-4" /></Button>
                      </>
                    )}
                    {q.status === "failed" && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-500" onClick={() => onRetry?.(q.id)}><RefreshCw className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive" onClick={() => onCancel?.(q.id)}><Ban className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export default function ManagerPage() {
  const qc = useQueryClient();
  const today = new Date();

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

  const { data: pendingQueue = [], isLoading: loadingPending } = useQuery<QueueWithRefs[]>({
    queryKey: ["queue-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_queue")
        .select("*, units(id, name), messages(name, message_type, content_data, template), instances(name)")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as QueueWithRefs[];
    },
    refetchInterval: 10000,
  });

  const [histDateFrom, setHistDateFrom] = useState<Date>(today);
  const [histDateTo, setHistDateTo] = useState<Date>(today);

  const { data: historyLogs = [], isLoading: loadingHistory, error: historyError } = useQuery<LogWithRefs[]>({
    queryKey: ["logs-history", histDateFrom, histDateTo],
    queryFn: async () => {
      const from = startOfDay(histDateFrom).toISOString();
      const to = endOfDay(histDateTo).toISOString();
      
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*, instances(name, units(name)), messages(name, message_type, content_data, template)")
        .gte("sent_at", from)
        .lte("sent_at", to)
        .order("sent_at", { ascending: false })
        .limit(1000);
      
      if (error) throw error;
      return (data ?? []) as LogWithRefs[];
    },
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importUnit, setImportUnit] = useState("");
  const [importTemplate, setImportTemplate] = useState("");
  const [importInstance, setImportInstance] = useState("");
  const [importDtInicio, setImportDtInicio] = useState<Date>(today);
  const [importDtFim, setImportDtFim] = useState<Date>(today);
  const [importStatus, setImportStatus] = useState("any");
  const [importTipo, setImportTipo] = useState("any");
  const [importSource, setImportSource] = useState("appointment");
  const [importInterval, setImportInterval] = useState(30);
  const [importing, setImporting] = useState(false);
  const [processing, setProcessing] = useState(false);

  const availableMessages = importUnit
    ? messages.filter((m) => (m.unit_ids.length === 0 || m.unit_ids.includes(importUnit)) && (m.trigger_source === importSource || !m.trigger_source))
    : [];
  const availableInstances = importUnit ? instances.filter((i) => i.unit_id === importUnit) : [];

  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUnit || !importTemplate || !importInstance || !importDtInicio || !importDtFim) {
      toast.error("Preencha todos os campos");
      return;
    }
    setImporting(true);
    try {
      const fetchParams = {
        unitId: importUnit,
        dtInicio: format(importDtInicio, "yyyy-MM-dd"),
        dtFim: format(importDtFim, "yyyy-MM-dd"),
        ...(importStatus !== "any" ? { status: importStatus } : {}),
        ...(importTipo !== "any" ? { tipoAgendamento: importTipo } : {}),
      };
      
      const result = importSource === "billing"
        ? await fetchBelleCobrancas({ data: fetchParams })
        : await fetchBelleAgendamentos({ data: fetchParams });
      
      const itemsToEnqueue = result.items
        .filter((a: any) => a.number)
        .map((a: any) => ({ ...a, messageId: importTemplate }));

      if (itemsToEnqueue.length === 0) {
        toast.error("Nenhum registro com celular encontrado no período.");
        return;
      }

      await enqueueBelleItems({
        data: { 
          unitId: importUnit, 
          instanceId: importInstance, 
          items: itemsToEnqueue,
          interval: importInterval
        },
      });
      
      toast.success(`${itemsToEnqueue.length} mensagens adicionadas à fila`);
      setImportOpen(false);
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err: any) {
      toast.error(err.message || "Falha ao importar");
    } finally {
      setImporting(false);
    }
  };

  const clearQueue = async () => {
    try {
      const { error } = await supabase
        .from("send_queue")
        .delete()
        .in("status", ["pending", "failed"]);
      if (error) throw error;
      toast.success("Fila de pendentes e falhas limpa");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error("Falha ao limpar fila");
    }
  };

  const dispatchQueue = async (id: string) => {
    try {
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Enviado");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error("Falha ao enviar");
    }
  };

  const cancelQueue = async (id: string) => {
    try {
      await cancelSendQueueItem({ data: { itemId: id } });
      toast.success("Cancelado");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error("Falha ao cancelar");
    }
  };

  const retryQueue = async (id: string) => {
    try {
      const { error } = await supabase.from("send_queue").update({ status: "pending", last_error: null }).eq("id", id);
      if (error) throw error;
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Reenviado");
      qc.invalidateQueries({ queryKey: ["queue-pending"] });
    } catch (err) {
      toast.error("Falha ao retentar");
    }
  };

  const handleProcessQueue = async () => {
    setProcessing(true);
    try {
      toast.info("Iniciando processamento da fila...");
      const res = await processQueueNow();
      if (res.success) {
        toast.success("Processamento iniciado com sucesso.");
        // Polling para atualizar a interface enquanto o worker roda
        const interval = setInterval(() => {
          qc.invalidateQueries({ queryKey: ["queue-pending"] });
        }, 3000);
        setTimeout(() => clearInterval(interval), 15000);
      } else {
        toast.error("Falha ao iniciar processamento");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar fila");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AppLayout title="Gerenciador">
      <Tabs defaultValue="pending" className="space-y-4">
        <div className="flex justify-between items-center">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="pending" className="gap-2"><Clock className="h-4 w-4" /> Pendentes</TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><History className="h-4 w-4" /> Histórico</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="text-destructive hover:text-destructive h-9">
                  <FilterX className="h-4 w-4 mr-1" /> Limpar Fila
                </Button>
              }
              title="Limpar toda a fila?"
              description="Isso removerá todas as mensagens pendentes e falhas de TODAS as unidades."
              onConfirm={clearQueue}
            />
            <Button onClick={() => setImportOpen(true)} className="h-9 gap-1 shadow-sm">
              <CalendarIcon className="h-4 w-4" /> Importar do Belle
            </Button>
            <Button 
              onClick={handleProcessQueue} 
              disabled={processing || pendingQueue.length === 0} 
              className="h-9 gap-1 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Rodar Fila
            </Button>
          </div>
        </div>

        <TabsContent value="pending">
          <Card className="glass overflow-hidden">
            <QueueTable
              rows={pendingQueue}
              isLoading={loadingPending}
              emptyMsg="Tudo em dia por aqui! Nenhuma mensagem pendente."
              showActions
              onDispatch={dispatchQueue}
              onCancel={cancelQueue}
              onRetry={retryQueue}
            />
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="glass p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">De:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !histDateFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                      {histDateFrom ? format(histDateFrom, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={histDateFrom} onSelect={(d) => d && setHistDateFrom(d)} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Até:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-9", !histDateTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                      {histDateTo ? format(histDateTo, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={histDateTo} onSelect={(d) => d && setHistDateTo(d)} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <Button variant="outline" size="icon" className="mt-6 h-9 w-9" onClick={() => qc.invalidateQueries({ queryKey: ["logs-history"] })}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </Card>

          <Card className="glass overflow-hidden">
            {historyError ? (
              <div className="p-12 text-center space-y-3">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto opacity-50" />
                <p className="text-sm font-medium">Erro ao carregar histórico</p>
                <p className="text-xs text-muted-foreground">Isso pode ser um problema de permissão ou fuso horário.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6">Unidade / WhatsApp</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead>Número / Mensagem</TableHead>
                    <TableHead className="w-24 px-6 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                  ) : historyLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 opacity-30">
                          <History className="h-12 w-12" />
                          <p>Nenhum registro encontrado neste período.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell className="px-6">
                          <div className="text-sm font-medium">{log.instances?.units?.name || "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{log.instances?.name || "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(log.sent_at), "dd/MM/yyyy", { locale: ptBR })}<br/>
                          <span className="text-muted-foreground opacity-70">{format(parseISO(log.sent_at), "HH:mm:ss")}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-mono mb-1">{log.number}</div>
                          <div className="text-muted-foreground text-xs max-w-sm">
                            <MessagePreview text={log.text} message={log.messages} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-6">
                          <Badge variant={log.success ? "default" : "destructive"} className={cn("text-[10px] uppercase font-bold", log.success ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : "")}>
                            {log.success ? "Sucesso" : "Falha"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary" /> Importar do Belle</DialogTitle>
            <DialogDescription>Selecione os parâmetros para puxar agendamentos.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitImport} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={importUnit} onValueChange={setImportUnit}>
                <SelectTrigger><SelectValue placeholder="Selecione a Unidade" /></SelectTrigger>
                <SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>O que importar?</Label>
              <Select value={importSource} onValueChange={setImportSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Agendamentos (Consultas)</SelectItem>
                  <SelectItem value="billing">Cobranças (Contas a Receber)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={importTemplate} onValueChange={setImportTemplate}>
                <SelectTrigger><SelectValue placeholder="Selecione o Template" /></SelectTrigger>
                <SelectContent>{availableMessages.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp de Envio</Label>
              <Select value={importInstance} onValueChange={setImportInstance}>
                <SelectTrigger><SelectValue placeholder="Selecione a Instância" /></SelectTrigger>
                <SelectContent>{availableInstances.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !importDtInicio && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                      {importDtInicio ? format(importDtInicio, "dd/MM/yy") : <span>De</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={importDtInicio} onSelect={(d) => d && setImportDtInicio(d)} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Data Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !importDtFim && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                      {importDtFim ? format(importDtFim, "dd/MM/yy") : <span>Até</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker mode="single" selected={importDtFim} onSelect={(d) => d && setImportDtFim(d)} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Intervalo entre mensagens (segundos)</Label>
              <Input 
                type="number" 
                min={5} 
                max={300} 
                value={importInterval} 
                onChange={(e) => setImportInterval(parseInt(e.target.value) || 30)}
                className="h-10"
              />
              <p className="text-[10px] text-muted-foreground">Recomendado: 15 a 45 segundos para evitar bloqueios.</p>
            </div>

            {importSource === "appointment" && (
              <div className="space-y-1.5">
                <Label>Status do Agendamento</Label>
                <Select value={importStatus} onValueChange={setImportStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Todos os Status</SelectItem>
                    <SelectItem value="Marcado">Marcado</SelectItem>
                    <SelectItem value="Confirmado">Confirmado</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                    <SelectItem value="Realizado">Realizado</SelectItem>
                    <SelectItem value="Faltou">Faltou</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="submit" disabled={importing} className="w-full h-11 font-bold">
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Realizar Importação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
