"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Smartphone,
  MessageSquareMore,
  QrCode,
  RefreshCw,
  LogOut,
  Send,
  History,
  Inbox,
  Calendar,
  Ban,
  Clock,
  FileText,
  ImageIcon,
  ListFilter,
  Loader2,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VARIABLES } from "@/lib/constants";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MessagePreview } from "@/components/message-preview";
import {
  createEvogoInstance,
  fetchEvogoQrCode,
  fetchEvogoStatus,
  logoutEvogoInstance,
  deleteEvogoInstance,
  fetchEvogoAdvancedSettings,
  updateEvogoAdvancedSettings,
  updateEvogoWebhook,
  sendEvogoText,
  dispatchSendQueueItem,
  cancelSendQueueItem,
  runCronJobNow,
} from "@/lib/evogo";
import { fetchBelleAgendamentos, fetchBelleCobrancas, enqueueBelleItems } from "@/lib/belle";

type UnitRow = Database["public"]["Tables"]["units"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type SendLogRow = Database["public"]["Tables"]["message_send_logs"]["Row"];
type SendQueueRow = Database["public"]["Tables"]["send_queue"]["Row"];
type SendQueueStatus = Database["public"]["Enums"]["send_queue_status"];
type CronJobRow = Database["public"]["Tables"]["cron_jobs"]["Row"];

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatDays(days: number[]): string {
  if (days.length === 7) return "Todos os dias";
  const sorted = [...days].sort();
  if (sorted.join(",") === "1,2,3,4,5") return "Dias úteis";
  if (sorted.join(",") === "0,6") return "Fins de semana";
  return sorted.map((d) => DAY_LABELS[d]).join(" ");
}

const QUEUE_STATUS_LABELS: Record<SendQueueStatus, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
  paused: "Pausado",
};

const QUEUE_STATUS_CLASSES: Record<SendQueueStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  paused: "bg-amber-500/15 text-amber-500 border-amber-500/30",
};

type InstanceStatus = Database["public"]["Enums"]["instance_status"];

const STATUS_LABELS: Record<InstanceStatus, string> = {
  connected: "Conectado",
  connecting: "Conectando",
  disconnected: "Desconectado",
  error: "Erro",
};

const STATUS_CLASSES: Record<InstanceStatus, string> = {
  connected: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  connecting: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  disconnected: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function UnitDetailPage() {
  const params = useParams();
  const unitId = params.unitId as string;
  const qc = useQueryClient();

  const { data: unit } = useQuery<UnitRow | null>({
    queryKey: ["unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("id", unitId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: instances = [] } = useQuery<InstanceRow[]>({
    queryKey: ["instances", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("*")
        .eq("unit_id", unitId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages = [] } = useQuery<MessageRow[]>({
    queryKey: ["messages", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`unit_ids.cs.{${unitId}},unit_ids.eq.{}`)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cronJobs = [], isLoading: cronLoading } = useQuery<CronJobRow[]>({
    queryKey: ["cron-jobs", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cron_jobs")
        .select("*")
        .or(`unit_ids.cs.{${unitId}},unit_ids.eq.{}`)
        .order("schedule_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: queue = [], isLoading: queueLoading } = useQuery<(SendQueueRow & { messages: { name: string, message_type: string, content_data: any } | null })[]>({
    queryKey: ["send-queue", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_queue")
        .select("*, messages(name, message_type, content_data)")
        .eq("unit_id", unitId)
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const { data: sendLogs = [], isLoading: logsLoading } = useQuery<(SendLogRow & { messages: { message_type: string, content_data: any } | null })[]>({
    queryKey: ["send-logs", unitId],
    enabled: instances.length > 0,
    queryFn: async () => {
      const ids = instances.map((i) => i.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*, messages(message_type, content_data)")
        .in("instance_id", ids)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const [instOpen, setInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<InstanceRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingMsg, setEditingMsg] = useState<MessageRow | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);
  const [triggerSource, setTriggerSource] = useState<string>("appointment");
  const [templateText, setTemplateText] = useState("");
  const [messageType, setMessageType] = useState<string>("text");
  const [contentData, setContentData] = useState<any>({});
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInstance, setQrInstance] = useState<{ id: string; name: string } | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [cronOpen, setCronOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJobRow | null>(null);
  const [cronName, setCronName] = useState("");
  const [cronSource, setCronSource] = useState("appointment");
  const [cronTemplate, setCronTemplate] = useState("");
  const [cronInstance, setCronInstance] = useState("");
  const [cronTime, setCronTime] = useState("09:00");
  const [cronDays, setCronDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [cronDaysQty, setCronDaysQty] = useState<number>(1);
  const [cronDaysDir, setCronDaysDir] = useState<"before" | "after" | "same">("before");
  const [cronStatus, setCronStatus] = useState("any");
  const [cronTipo, setCronTipo] = useState("any");
  const [cronAutoDispatch, setCronAutoDispatch] = useState(false);
  const [cronActive, setCronActive] = useState(true);
  const [cronSubmitting, setCronSubmitting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTemplate, setImportTemplate] = useState<string>("");
  const [importInstance, setImportInstance] = useState<string>("");
  const [importDtInicio, setImportDtInicio] = useState("");
  const [importDtFim, setImportDtFim] = useState("");
  const [importStatus, setImportStatus] = useState<string>("any");
  const [importTipo, setImportTipo] = useState("any");
  const [importSource, setImportSource] = useState<string>("appointment");
  const [importInterval, setImportInterval] = useState(30);
  const [importing, setImporting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendInstance, setSendInstance] = useState<{ id: string; name: string } | null>(null);
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendDelay, setSendDelay] = useState("0");
  const [sendMessageId, setSendMessageId] = useState<string | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [advLoading, setAdvLoading] = useState(false);
  const [advSettings, setAdvSettings] = useState({
    rejectCalls: false,
    rejectCallMessage: "",
    readMessages: false,
    readStatus: false,
    alwaysOnline: false,
  });

  const openCronDialog = (existing: CronJobRow | null = null) => {
    setEditingCron(existing);
    if (existing) {
      setCronName(existing.name ?? "");
      setCronTemplate(existing.message_id);
      
      let instId = "";
      if (existing.instance_mapping && typeof existing.instance_mapping === 'object') {
        instId = (existing.instance_mapping as Record<string, string>)[unitId] ?? "";
      }
      setCronInstance(instId);
      setCronTime(existing.schedule_time);
      setCronDays(existing.days_of_week);
      setCronDaysQty(Math.abs(existing.days_offset));
      setCronDaysDir(
        existing.days_offset === 0 ? "same" : existing.days_offset > 0 ? "before" : "after",
      );
      setCronSource((existing as any).trigger_source || "appointment");
      setCronStatus(existing.status_filter ?? "any");
      setCronTipo(existing.tipo_filter ?? "any");
      setCronAutoDispatch(existing.auto_dispatch);
      setCronActive(existing.active);
    } else {
      setCronName("");
      setCronTemplate(messages[0]?.id ?? "");
      setCronInstance(instances[0]?.id ?? "");
      setCronTime("09:00");
      setCronDays([0, 1, 2, 3, 4, 5, 6]);
      setCronDaysQty(1);
      setCronDaysDir("before");
      setCronStatus("any");
      setCronTipo("any");
      setCronAutoDispatch(false);
      setCronActive(true);
    }
    setCronOpen(true);
  };

  const submitCron = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cronTemplate) {
      toast.error("Selecione um template");
      return;
    }
    if (!cronInstance) {
      toast.error("Selecione uma instância");
      return;
    }
    if (cronDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana");
      return;
    }
    setCronSubmitting(true);
    try {
      const { data: unitFull } = await supabase
        .from("units")
        .select("company_id")
        .eq("id", unitId)
        .maybeSingle();
      if (!unitFull?.company_id) throw new Error("Unidade sem empresa vinculada");

      const offsetSigned =
        cronDaysDir === "same" ? 0 : cronDaysDir === "before" ? cronDaysQty : -cronDaysQty;
      const payload = {
        company_id: unitFull.company_id,
        unit_ids: [unitId],
        instance_mapping: { [unitId]: cronInstance },
        message_id: cronTemplate,
        name: cronName.trim() || null,
        schedule_time: cronTime,
        days_of_week: cronDays,
        days_offset: offsetSigned,
        status_filter: cronStatus === "any" ? null : cronStatus,
        tipo_filter: cronTipo === "any" ? null : cronTipo,
        trigger_source: cronSource,
        auto_dispatch: cronAutoDispatch,
        active: cronActive,
      };
      const res = editingCron
        ? await supabase.from("cron_jobs").update(payload).eq("id", editingCron.id)
        : await supabase.from("cron_jobs").insert(payload);
      if (res.error) throw new Error(res.error.message);
      toast.success(editingCron ? "Automação atualizada" : "Automação criada");
      setCronOpen(false);
      setEditingCron(null);
      qc.invalidateQueries({ queryKey: ["cron-jobs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setCronSubmitting(false);
    }
  };

  const deleteCron = async (id: string) => {
    try {
      const { error } = await supabase.from("cron_jobs").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Automação removida");
      qc.invalidateQueries({ queryKey: ["cron-jobs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  };

  const toggleCron = async (cron: CronJobRow) => {
    try {
      const { error } = await supabase
        .from("cron_jobs")
        .update({ active: !cron.active })
        .eq("id", cron.id);
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ["cron-jobs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  };

  const runCronNow = async (cron: CronJobRow) => {
    try {
      toast.info("Executando automação...");
      const res = await runCronJobNow({ data: { cronJobId: cron.id } });
      toast.success(
        `Automação executada: ${res.count} mensagens criadas${res.dispatched > 0 ? `, ${res.dispatched} enviadas` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["cron-jobs", unitId] });
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
      if (res.dispatched > 0) {
        qc.invalidateQueries({ queryKey: ["send-logs", unitId] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao executar");
      qc.invalidateQueries({ queryKey: ["cron-jobs", unitId] });
    }
  };

  useEffect(() => {
    if (!editingInst) return;
    setWebhookUrl(editingInst.webhook_url ?? "");
    setAdvLoading(true);
    fetchEvogoAdvancedSettings({ data: { instanceId: editingInst.id } })
      .then((cfg) => setAdvSettings(cfg))
      .catch((err) => {
        console.warn("[evogo] fetch advanced settings falhou", err);
        toast.error("Não foi possível carregar as configurações avançadas");
      })
      .finally(() => setAdvLoading(false));
  }, [editingInst]);

  const submitInstance = async (form: FormData) => {
    const name = String(form.get("name") ?? "").trim();
    const proxyOverride = String(form.get("proxy") ?? "").trim();
    if (!name) {
      toast.error("Nome obrigatório");
      return;
    }

    setSubmitting(true);
    try {
      if (editingInst) {
        const { error } = await supabase
          .from("instances")
          .update({ name, active: form.get("active") === "on" })
          .eq("id", editingInst.id);
        if (error) throw new Error(error.message);

        const trimmedWebhook = webhookUrl.trim();
        if (trimmedWebhook !== (editingInst.webhook_url ?? "")) {
          await updateEvogoWebhook({
            data: { instanceId: editingInst.id, webhookUrl: trimmedWebhook },
          });
        }

        await updateEvogoAdvancedSettings({
          data: { instanceId: editingInst.id, settings: advSettings },
        });

        toast.success("Salvo");
      } else {
        const res = await createEvogoInstance({
          data: { unitId, name, proxy: proxyOverride || undefined },
        });
        toast.success("Instância criada. Escaneie o QR para conectar.");
        if (res.qrBase64) {
          setQrInstance({ id: res.id, name: res.instanceName });
          setQrBase64(res.qrBase64);
          setQrOpen(true);
        }
      }
      setInstOpen(false);
      setEditingInst(null);
      qc.invalidateQueries({ queryKey: ["instances", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteInstance = async (id: string) => {
    try {
      await deleteEvogoInstance({ data: { instanceId: id } });
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["instances", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    }
  };

  const openQr = async (inst: InstanceRow) => {
    setQrInstance({ id: inst.id, name: inst.instance_name });
    setQrBase64(null);
    setQrOpen(true);
    setQrLoading(true);
    try {
      const res = await fetchEvogoQrCode({ data: { instanceId: inst.id } });
      if (res.connected) {
        toast.success("WhatsApp já está conectado");
        setQrOpen(false);
        qc.invalidateQueries({ queryKey: ["instances", unitId] });
      } else {
        setQrBase64(res.qrBase64);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao obter QR");
    } finally {
      setQrLoading(false);
    }
  };

  const refreshStatus = async (id: string) => {
    try {
      const res = await fetchEvogoStatus({ data: { instanceId: id } });
      toast.success(`Status: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["instances", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao verificar");
    }
  };

  const refreshAllStatus = async () => {
    if (instances.length === 0) return;
    toast.info(`Atualizando ${instances.length} instância(s)...`);
    const results = await Promise.allSettled(
      instances.map((i) => fetchEvogoStatus({ data: { instanceId: i.id } })),
    );
    qc.invalidateQueries({ queryKey: ["instances", unitId] });
    const fails = results.filter((r) => r.status === "rejected").length;
    if (fails === 0) {
      toast.success("Status atualizado");
    } else {
      toast.warning(`${results.length - fails} ok, ${fails} falharam`);
    }
  };

  useEffect(() => {
    if (!qrOpen || !qrInstance) return;
    const id = setInterval(() => {
      fetchEvogoQrCode({ data: { instanceId: qrInstance.id } })
        .then((res) => {
          if (res.connected) {
            toast.success("WhatsApp conectado!");
            setQrOpen(false);
            fetchEvogoStatus({ data: { instanceId: qrInstance.id } }).finally(() => {
              qc.invalidateQueries({ queryKey: ["instances", unitId] });
            });
          } else if (res.qrBase64) {
            setQrBase64(res.qrBase64);
          }
        })
        .catch((err) => console.warn("[evogo] poll QR/conexão falhou", err));
    }, 5000);
    return () => clearInterval(id);
  }, [qrOpen, qrInstance, qc, unitId]);

  const openSend = (
    inst: { id: string; name: string },
    opts?: { text?: string; messageId?: string },
  ) => {
    setSendInstance({ id: inst.id, name: inst.name });
    setSendNumber("");
    setSendText(opts?.text ?? "");
    setSendDelay("0");
    setSendMessageId(opts?.messageId ?? null);
    setSendOpen(true);
  };

  const openSendFromTemplate = (m: MessageRow) => {
    const inst = instances.find((i) => i.status === "connected") ?? instances[0];
    if (!inst) {
      toast.error("Cadastre uma instância primeiro");
      return;
    }
    openSend({ id: inst.id, name: inst.name }, { text: m.template, messageId: m.id });
  };

  const submitSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendInstance) return;
    const text = sendText.trim();
    const number = sendNumber.trim();
    if (!number || !text) {
      toast.error("Número e mensagem são obrigatórios");
      return;
    }
    const delay = Math.max(0, parseInt(sendDelay || "0", 10) || 0);
    setSendSubmitting(true);
    try {
      const res = await sendEvogoText({
        data: {
          instanceId: sendInstance.id,
          number,
          text,
          delay,
          ...(sendMessageId ? { messageId: sendMessageId } : {}),
        },
      });
      toast.success(`Mensagem enviada para ${number}`);
      setSendOpen(false);
      qc.invalidateQueries({ queryKey: ["send-logs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSendSubmitting(false);
    }
  };

  const clearQueue = async () => {
    try {
      const { error } = await supabase.from("send_queue").delete().eq("unit_id", unitId);
      if (error) throw new Error(error.message);
      toast.success("Fila limpa");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao limpar fila");
    }
  };

  const dispatchQueue = async (id: string) => {
    try {
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
      qc.invalidateQueries({ queryKey: ["send-logs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
    }
  };

  const cancelQueue = async (id: string) => {
    try {
      await cancelSendQueueItem({ data: { itemId: id } });
      toast.success("Item cancelado");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar");
    }
  };

  const retryQueue = async (id: string) => {
    try {
      const { error } = await supabase.from("send_queue").update({ status: "pending", last_error: null }).eq("id", id);
      if (error) throw error;
      await dispatchSendQueueItem({ data: { itemId: id } });
      toast.success("Reenviado");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
      qc.invalidateQueries({ queryKey: ["send-logs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao retentar");
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
    }
  };

  const doLogout = async (id: string) => {
    try {
      await logoutEvogoInstance({ data: { instanceId: id } });
      toast.success("Desconectada");
      qc.invalidateQueries({ queryKey: ["instances", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar");
    }
  };

  const submitMessage = async (form: FormData) => {
    const name = String(form.get("name") ?? "").trim();
    const template = templateText.trim();
    if (!name || !template) {
      toast.error("Nome e template obrigatórios");
      return;
    }

    if (editingMsg) {
      const { error } = await supabase
        .from("messages")
        .update({ 
          name, 
          template: templateText, 
          message_type: messageType,
          trigger_source: triggerSource,
          content_data: contentData,
          active: form.get("active") === "on" 
        })
        .eq("id", editingMsg.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Salvo");
        setMsgOpen(false);
        setEditingMsg(null);
        setTemplateText("");
        setTriggerSource("appointment");
        qc.invalidateQueries({ queryKey: ["messages", unitId] });
      }
      return;
    }

    const { data: unit } = await supabase
      .from("units")
      .select("company_id")
      .eq("id", unitId)
      .maybeSingle();
    if (!unit?.company_id) {
      toast.error("Unidade sem empresa vinculada");
      return;
    }
    const { error } = await supabase.from("messages").insert({
      unit_ids: [unitId],
      company_id: unit.company_id,
      name,
      template: templateText,
      message_type: messageType,
      trigger_source: triggerSource,
      content_data: contentData,
      active: form.get("active") === "on",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      setMsgOpen(false);
      setEditingMsg(null);
      setTemplateText("");
      setTriggerSource("appointment");
      qc.invalidateQueries({ queryKey: ["messages", unitId] });
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", unitId] });
  };

  const openEditMessage = (m: MessageRow) => {
    setEditingMsg(m);
    setTemplateText(m.template || "");
    setTriggerSource((m as any).trigger_source || "appointment");
    setMessageType((m as any).message_type || "text");
    setContentData(m.content_data || {});
    setMsgOpen(true);
  };
  const instanceMap = Object.fromEntries(instances.map((i) => [i.id, i.name]));
  const messageMap = Object.fromEntries(messages.map((m) => [m.id, m.name]));

  return (
    <TooltipProvider>
      <AppLayout title={unit?.name ?? "Unidade"}>
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/units">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para unidades
            </Link>
          </Button>
        </div>
        <Tabs defaultValue="instances">
          <TabsList className="mb-4">
            <TabsTrigger value="instances">
              <Smartphone className="h-4 w-4 mr-1" />
              Instâncias
            </TabsTrigger>
            <TabsTrigger value="messages">
              <MessageSquareMore className="h-4 w-4 mr-1" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="automations">
              <Clock className="h-4 w-4 mr-1" />
              Automações
            </TabsTrigger>
            <TabsTrigger value="manager">
              <Inbox className="h-4 w-4 mr-1" />
              Gerenciador
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              Histórico
            </TabsTrigger>
          </TabsList>

        <TabsContent value="instances" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={refreshAllStatus} disabled={instances.length === 0}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar status
            </Button>
            <Dialog
              open={instOpen}
              onOpenChange={(o) => {
                setInstOpen(o);
                if (!o) setEditingInst(null);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova instância
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingInst ? "Editar" : "Nova"} instância Evogo</DialogTitle>
                </DialogHeader>
                <form action={submitInstance} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome amigável</Label>
                    <Input
                      name="name"
                      required
                      defaultValue={editingInst?.name}
                      placeholder="Ex: WhatsApp Recepção"
                    />
                  </div>
                  {!editingInst && (
                    <div className="space-y-2">
                      <Label>Proxy (Opcional)</Label>
                      <Input
                        name="proxy"
                        placeholder="http://usuario:senha@ip-brasileiro:porta"
                      />
                    </div>
                  )}
                  {editingInst && (
                    <>
                      <div className="flex items-center gap-2">
                        <Switch
                          name="active"
                          defaultChecked={editingInst.active ?? true}
                          id="iact"
                        />
                        <Label htmlFor="iact">Ativa</Label>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-border">
                        <Label htmlFor="webhook">Webhook URL</Label>
                        <Input
                          id="webhook"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          placeholder="https://seu-servico.com/api/webhook"
                          disabled={advLoading}
                        />
                      </div>

                      <div className="space-y-3 pt-2 border-t border-border">
                        <p className="text-sm font-medium">Configurações avançadas</p>
                        {advLoading ? (
                          <p className="text-xs text-muted-foreground">Carregando...</p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="alwaysOnline" className="font-normal">
                                Sempre online
                              </Label>
                              <Switch
                                id="alwaysOnline"
                                checked={advSettings.alwaysOnline}
                                onCheckedChange={(v) =>
                                  setAdvSettings((s) => ({ ...s, alwaysOnline: v }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="readMessages" className="font-normal">
                                Marcar mensagens como lidas
                              </Label>
                              <Switch
                                id="readMessages"
                                checked={advSettings.readMessages}
                                onCheckedChange={(v) =>
                                  setAdvSettings((s) => ({ ...s, readMessages: v }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="readStatus" className="font-normal">
                                Marcar status como visto
                              </Label>
                              <Switch
                                id="readStatus"
                                checked={advSettings.readStatus}
                                onCheckedChange={(v) =>
                                  setAdvSettings((s) => ({ ...s, readStatus: v }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <Label htmlFor="rejectCalls" className="font-normal">
                                Rejeitar chamadas
                              </Label>
                              <Switch
                                id="rejectCalls"
                                checked={advSettings.rejectCalls}
                                onCheckedChange={(v) =>
                                  setAdvSettings((s) => ({ ...s, rejectCalls: v }))
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Processando..." : editingInst ? "Salvar" : "Criar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Instância Evogo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-64 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhuma instância
                    </TableCell>
                  </TableRow>
                ) : (
                  instances.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {i.instance_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_CLASSES[i.status]}>
                          {STATUS_LABELS[i.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Enviar mensagem"
                          disabled={i.status !== "connected"}
                          onClick={() => openSend(i)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="QR Code"
                          onClick={() => openQr(i)}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Verificar status"
                          onClick={() => refreshStatus(i.id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button size="icon" variant="ghost" title="Desconectar">
                              <LogOut className="h-4 w-4" />
                            </Button>
                          }
                          title="Desconectar instância?"
                          description="A sessão WhatsApp será encerrada. A instância continua existindo para reconectar."
                          onConfirm={() => doLogout(i.id)}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => {
                            setEditingInst(i);
                            setInstOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button size="icon" variant="ghost" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Excluir instância?"
                          description="A instância será removida do Evogo e desta plataforma. Mensagens vinculadas perderão o link."
                          onConfirm={() => deleteInstance(i.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Conectar WhatsApp
                </DialogTitle>
                {qrInstance && (
                  <DialogDescription>
                    Escaneie o QR Code abaixo com seu WhatsApp para conectar a instância{" "}
                    <span className="font-mono font-medium text-foreground">{qrInstance.name}</span>
                  </DialogDescription>
                )}
              </DialogHeader>

              {qrLoading ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Carregando QR...
                </div>
              ) : qrBase64 ? (
                <div className="space-y-4">
                  <div className="flex justify-center p-4">
                    <img
                      src={
                        qrBase64.startsWith("data:") || qrBase64.startsWith("http") ? qrBase64 : `data:image/png;base64,${qrBase64}`
                      }
                      alt="QR Code"
                      className="bg-white rounded w-60 h-60 shadow-lg"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded-lg border border-muted-foreground/10">
                    <p className="font-medium text-foreground mb-2">Como conectar:</p>
                    <p>1. Abra o WhatsApp no seu celular</p>
                    <p>2. Toque em <span className="font-semibold text-foreground">Aparelhos conectados</span></p>
                    <p>3. Toque em <span className="font-semibold text-foreground">Conectar um aparelho</span></p>
                    <p>4. Aponte seu celular para esta tela</p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  QR não disponível. Tente atualizar.
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!qrInstance || qrLoading}
                  onClick={() =>
                    qrInstance &&
                    openQr({
                      id: qrInstance.id,
                      instance_name: qrInstance.name,
                    } as InstanceRow)
                  }
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Atualizar QR Code
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <div className="flex justify-end">
            <Dialog
              open={msgOpen}
              onOpenChange={(o) => {
                setMsgOpen(o);
                if (!o) {
                  setEditingMsg(null);
                  setTemplateText("");
                  setTriggerSource("appointment");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova mensagem
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingMsg ? "Editar" : "Nova"} mensagem</DialogTitle>
                </DialogHeader>
                <form action={submitMessage} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      name="name"
                      required
                      defaultValue={editingMsg?.name}
                      placeholder="Ex: Lembrete de agendamento"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Mensagem</Label>
                      <Tabs value={messageType} onValueChange={setMessageType} className="w-full">
                        <TabsList className="grid grid-cols-3 h-9 bg-muted/50">
                          <TabsTrigger value="text" className="text-xs"><FileText className="h-3 w-3 mr-1" />Texto</TabsTrigger>
                          <TabsTrigger value="media" className="text-xs"><ImageIcon className="h-3 w-3 mr-1" />Mídia</TabsTrigger>
                          <TabsTrigger value="poll" className="text-xs"><ListFilter className="h-3 w-3 mr-1" />Enquete</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="space-y-2">
                      <Label>Origem dos Dados</Label>
                      <Select value={triggerSource} onValueChange={setTriggerSource}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="appointment">Agendamento</SelectItem>
                          <SelectItem value="billing">Cobrança</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>{messageType === "media" ? "Legenda (opcional)" : messageType === "poll" ? "Pergunta" : "Template / Texto"}</Label>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Negrito" onClick={() => {
                          const el = document.getElementById("template-area-unit") as HTMLTextAreaElement;
                          const start = el.selectionStart;
                          const end = el.selectionEnd;
                          const text = el.value;
                          const newText = text.substring(0, start) + "*" + text.substring(start, end) + "*" + text.substring(end);
                          setTemplateText(newText);
                        }}>
                          <span className="font-bold">B</span>
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Itálico" onClick={() => {
                          const el = document.getElementById("template-area-unit") as HTMLTextAreaElement;
                          const start = el.selectionStart;
                          const end = el.selectionEnd;
                          const text = el.value;
                          const newText = text.substring(0, start) + "_" + text.substring(start, end) + "_" + text.substring(end);
                          setTemplateText(newText);
                        }}>
                          <span className="italic font-serif">I</span>
                        </Button>
                      </div>
                    </div>
                    
                    <div className="bg-muted/30 p-2 rounded-md border border-border">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2 px-1">Variáveis disponíveis</p>
                      <div className="flex flex-wrap gap-1">
                        {(VARIABLES[triggerSource as keyof typeof VARIABLES] || []).map((v) => (
                          <Badge 
                            key={v.value} 
                            variant="secondary" 
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-[10px] py-0 h-5"
                            onClick={() => {
                              const el = document.getElementById("template-area-unit") as HTMLTextAreaElement;
                              const start = el.selectionStart;
                              const end = el.selectionEnd;
                              const text = el.value;
                              const tag = `{{${v.value}}}`;
                              const newText = text.substring(0, start) + tag + text.substring(end);
                              setTemplateText(newText);
                              setTimeout(() => {
                                el.focus();
                                el.setSelectionRange(start + tag.length, start + tag.length);
                              }, 0);
                            }}
                          >
                            {v.label}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Textarea 
                      id="template-area-unit"
                      name="template" 
                      rows={6} 
                      value={templateText}
                      onChange={(e) => setTemplateText(e.target.value)}
                      placeholder="Digite aqui..." 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch name="active" defaultChecked={editingMsg?.active ?? true} id="mact" />
                    <Label htmlFor="mact">Ativa</Label>
                  </div>
                  <DialogFooter>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Texto (preview)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhuma mensagem
                    </TableCell>
                  </TableRow>
                ) : (
                  messages.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-md">
                        <MessagePreview text={m.template} message={m} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.active ? "default" : "secondary"}>
                          {m.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Enviar agora"
                          onClick={() => openSendFromTemplate(m)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => openEditMessage(m)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button size="icon" variant="ghost" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Excluir mensagem?"
                          onConfirm={() => deleteMessage(m.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="manager" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Gerenciamento da fila de mensagens.
            </p>
            <div className="flex gap-2">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10 border-destructive/30">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar Fila
                  </Button>
                }
                title="Limpar fila de mensagens?"
                description="Isso removerá todas as mensagens PENDENTES desta unidade da fila. Esta ação não pode ser desfeita."
                onConfirm={async () => {
                  try {
                    const { error } = await supabase
                      .from("send_queue")
                      .delete()
                      .eq("unit_id", unitId)
                      .eq("status", "pending");
                    if (error) throw error;
                    toast.success("Fila limpa com sucesso");
                    qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
                  } catch (err: any) {
                    toast.error(err.message);
                  }
                }}
              />
              <Button onClick={() => setImportOpen(true)} disabled={messages.length === 0}>
                <Calendar className="h-4 w-4 mr-1" />
                Importar do Belle
              </Button>
            </div>
          </div>
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : queue.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum item na fila.
                    </TableCell>
                  </TableRow>
                ) : (
                  queue.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>{q.cliente_nome ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{q.number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal bg-primary/5 text-primary border-primary/20">
                          {q.messages?.name ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <MessagePreview text={q.text} message={q.messages} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={QUEUE_STATUS_CLASSES[q.status]}>
                          {QUEUE_STATUS_LABELS[q.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {q.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => dispatchQueue(q.id)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hover:text-destructive"
                              onClick={() => cancelQueue(q.id)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {q.status === "failed" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-amber-500"
                              onClick={() => retryQueue(q.id)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hover:text-destructive"
                              onClick={() => cancelQueue(q.id)}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Automações baseadas em cron.
            </p>
            <Button onClick={() => openCronDialog()} disabled={messages.length === 0}>
              <Plus className="h-4 w-4 mr-1" />
              Nova automação
            </Button>
          </div>
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Última execução</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cronLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : cronJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma automação.
                    </TableCell>
                  </TableRow>
                ) : (
                  cronJobs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <div>{c.name ?? "—"}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="secondary" className="text-[10px] h-4 font-bold uppercase tracking-tighter">
                            {(c as any).trigger_source === 'billing' ? 'Cobrança' : 'Agendamento'}
                          </Badge>
                          {(c as any).status_filter && (
                            <Badge variant="outline" className="text-[10px] h-4 font-bold uppercase tracking-tighter border-emerald-500/20 text-emerald-500/80 bg-emerald-500/5">
                              {(c as any).status_filter}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.schedule_time}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.last_run_at ? new Date(c.last_run_at).toLocaleString("pt-BR") : "Nunca"}
                      </TableCell>
                      <TableCell>
                        <Switch checked={c.active} onCheckedChange={() => toggleCron(c)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => runCronNow(c)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openCronDialog(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : sendLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum envio.
                    </TableCell>
                  </TableRow>
                ) : (
                  sendLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {new Date(log.sent_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.number}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-md">
                        <MessagePreview text={log.text} message={(log as any).messages} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? "Enviada" : "Falhou"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

        {/* Dialog: Enviar Mensagem Avulsa */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar mensagem</DialogTitle>
              <DialogDescription>
                Disparo manual via instância <span className="font-bold text-primary">{sendInstance?.name}</span>
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitSend} className="space-y-4">
              <div className="space-y-2">
                <Label>Instância de Envio</Label>
                <Select 
                  value={sendInstance?.id} 
                  onValueChange={(val) => {
                    const inst = instances.find(i => i.id === val);
                    if (inst) setSendInstance({ id: inst.id, name: inst.name });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a instância..." />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            inst.status === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500"
                          )} />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{inst.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                              {inst.status === 'connected' ? 'Conectado' : 'Desconectado'}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número do WhatsApp</Label>
                <Input 
                  placeholder="Ex: 5511999999999" 
                  value={sendNumber} 
                  onChange={(e) => setSendNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea 
                  rows={5} 
                  value={sendText} 
                  onChange={(e) => setSendText(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={sendSubmitting}>
                  {sendSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar agora
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Automação (Cron) */}
        <Dialog open={cronOpen} onOpenChange={setCronOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCron ? "Editar" : "Nova"} Automação</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitCron} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Automação</Label>
                  <Input value={cronName} onChange={(e) => setCronName(e.target.value)} placeholder="Ex: Lembrete 24h" />
                </div>
                <div className="space-y-2">
                  <Label>Template / Mensagem</Label>
                  <Select value={cronTemplate} onValueChange={setCronTemplate}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {messages.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Disparo (Origem)</Label>
                  <Select value={cronSource} onValueChange={setCronSource}>
                    <SelectTrigger className={cn(cronSource === 'billing' ? "border-amber-500/50 bg-amber-500/5" : "border-primary/50 bg-primary/5")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">
                        <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Agendamento</div>
                      </SelectItem>
                      <SelectItem value="billing">
                        <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-amber-500" /> Cobrança</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Instância de Disparo</Label>
                  <Select value={cronInstance} onValueChange={setCronInstance}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {instances.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {cronSource === "appointment" && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Status do Agendamento
                    </Label>
                    <Select value={cronStatus} onValueChange={setCronStatus}>
                      <SelectTrigger className="h-10 bg-muted/20">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
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
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Tipo de Agendamento
                    </Label>
                    <Select value={cronTipo} onValueChange={setCronTipo}>
                      <SelectTrigger className="h-10 bg-muted/20">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Todos os Tipos</SelectItem>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="Retorno">Retorno</SelectItem>
                        <SelectItem value="Avaliação">Avaliação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Horário de Execução</Label>
                  <Input type="time" value={cronTime} onChange={(e) => setCronTime(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dias de Disparo (Offset do Agendamento)</Label>
                <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-lg border border-border">
                  <Input 
                    type="number" 
                    className="w-20" 
                    value={cronDaysQty} 
                    onChange={(e) => setCronDaysQty(parseInt(e.target.value) || 0)} 
                  />
                  <Select value={cronDaysDir} onValueChange={(v: any) => setCronDaysDir(v)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Dia(s) antes</SelectItem>
                      <SelectItem value="same">No dia</SelectItem>
                      <SelectItem value="after">Dia(s) depois</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground italic">da data do agendamento</span>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={cronAutoDispatch} onCheckedChange={setCronAutoDispatch} id="auto" />
                  <Label htmlFor="auto">Disparo automático</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={cronActive} onCheckedChange={setCronActive} id="act" />
                  <Label htmlFor="act">Ativa</Label>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={cronSubmitting}>Salvar Automação</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dialog: Importação Belle */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Importar Agendamentos (Belle)</DialogTitle>
              <DialogDescription>Puxar agendamentos do sistema Belle para a fila de envio.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
               <div className="space-y-2">
                 <Label>O que importar?</Label>
                 <Select value={importSource} onValueChange={setImportSource}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">Agendamentos (Consultas)</SelectItem>
                      <SelectItem value="billing">Cobranças (Contas a Receber)</SelectItem>
                    </SelectContent>
                 </Select>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>De:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-9",
                            !importDtInicio && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {importDtInicio ? format(parseISO(importDtInicio), "P", { locale: ptBR }) : "Início"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={importDtInicio ? parseISO(importDtInicio) : undefined}
                          onSelect={(d) => setImportDtInicio(d ? format(d, "yyyy-MM-dd") : "")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Até:</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal h-9",
                            !importDtFim && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {importDtFim ? format(parseISO(importDtFim), "P", { locale: ptBR }) : "Fim"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={importDtFim ? parseISO(importDtFim) : undefined}
                          onSelect={(d) => setImportDtFim(d ? format(d, "yyyy-MM-dd") : "")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
               </div>

               {importSource === "appointment" && (
                 <div className="space-y-2">
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
               <div className="space-y-2">
                 <Label>Template para vincular</Label>
                 <Select value={importTemplate} onValueChange={setImportTemplate}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {messages
                        .filter(m => m.trigger_source === importSource || !m.trigger_source)
                        .map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)
                      }
                    </SelectContent>
                 </Select>
               </div>
            </div>
            <DialogFooter>
              <Button 
                className="w-full" 
                onClick={async () => {
                  if (!importTemplate) { toast.error("Selecione um template"); return; }
                  setImporting(true);
                  try {
                    const params = {
                      unitId,
                      dtInicio: importDtInicio,
                      dtFim: importDtFim,
                      status: importStatus,
                      tipo: importTipo
                    };
                    
                    const res = importSource === "billing" 
                      ? await fetchBelleCobrancas({ data: params })
                      : await fetchBelleAgendamentos({ data: params });

                    const itemsToEnqueue = res.items.map((item: any) => ({
                      ...item,
                      messageId: importTemplate
                    }));

                    const enqRes = await enqueueBelleItems({
                      data: {
                        unitId,
                        items: itemsToEnqueue,
                        instanceId: instances[0]?.id,
                        interval: importInterval
                      }
                    });

                    toast.success(`${enqRes.count} registros importados para a fila`);
                    setImportOpen(false);
                    qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
                  } catch (err: any) {
                    toast.error(err.message);
                  } finally {
                    setImporting(false);
                  }
                }}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Iniciar Importação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    </TooltipProvider>
  );
}
