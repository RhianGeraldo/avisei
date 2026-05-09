import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { fetchBelleAgendamentos, enqueueBelleAgendamentos } from "@/lib/belle";

export const Route = createFileRoute("/units_/$unitId")({ component: UnitDetailPage });

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
};

const QUEUE_STATUS_CLASSES: Record<SendQueueStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  sent: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
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

function UnitDetailPage() {
  const { unitId } = Route.useParams();
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
      // Mensagens desta unidade + compartilhadas da empresa (unit_ids vazio).
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

  const { data: queue = [], isLoading: queueLoading } = useQuery<SendQueueRow[]>({
    queryKey: ["send-queue", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("send_queue")
        .select("*")
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sendLogs = [], isLoading: logsLoading } = useQuery<SendLogRow[]>({
    queryKey: ["send-logs", unitId],
    enabled: instances.length > 0,
    queryFn: async () => {
      const ids = instances.map((i) => i.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("message_send_logs")
        .select("*")
        .in("instance_id", ids)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [instOpen, setInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<InstanceRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInstance, setQrInstance] = useState<{ id: string; name: string } | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [cronOpen, setCronOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJobRow | null>(null);
  const [cronName, setCronName] = useState("");
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
  const [importTipo, setImportTipo] = useState<string>("any");
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
  const [msgOpen, setMsgOpen] = useState(false);
  const [editingMsg, setEditingMsg] = useState<MessageRow | null>(null);

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
        existing.days_offset === 0 ? "same" : existing.days_offset < 0 ? "before" : "after",
      );
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
        cronDaysDir === "same" ? 0 : cronDaysDir === "before" ? -cronDaysQty : cronDaysQty;
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

  // Carrega configurações avançadas + webhook ao abrir edição.
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
        // Local: nome + active.
        const { error } = await supabase
          .from("instances")
          .update({ name, active: form.get("active") === "on" })
          .eq("id", editingInst.id);
        if (error) throw new Error(error.message);

        // Webhook: só repassa pro Evogo se mudou.
        const trimmedWebhook = webhookUrl.trim();
        if (trimmedWebhook !== (editingInst.webhook_url ?? "")) {
          await updateEvogoWebhook({
            data: { instanceId: editingInst.id, webhookUrl: trimmedWebhook },
          });
        }

        // Configurações avançadas: PUT na Evolution.
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

  // Polling: detecta conexão rápido (5s) e renova QR antes da expiração (~30s).
  useEffect(() => {
    if (!qrOpen || !qrInstance) return;
    const id = setInterval(() => {
      fetchEvogoQrCode({ data: { instanceId: qrInstance.id } })
        .then((res) => {
          if (res.connected) {
            toast.success("WhatsApp conectado!");
            setQrOpen(false);
            qc.invalidateQueries({ queryKey: ["instances", unitId] });
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
    // Mensagens não têm instância vinculada — pega a primeira conectada (ou qualquer existente).
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
      toast.success(`Mensagem enviada para ${res.number}`);
      setSendOpen(false);
      qc.invalidateQueries({ queryKey: ["send-logs", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSendSubmitting(false);
    }
  };

  const submitImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTemplate || !importInstance || !importDtInicio || !importDtFim) {
      toast.error("Selecione template, instância e período");
      return;
    }
    setImporting(true);
    try {
      // Belle quer dd/mm/yyyy. Inputs HTML date dão yyyy-mm-dd.
      const toBelle = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
      };
      const fetchInput: Record<string, unknown> = {
        unitId,
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
        data: { unitId, instanceId: importInstance, items },
      });
      const extras: string[] = [];
      if (result.semCelular > 0) extras.push(`${result.semCelular} sem celular`);
      if (enq.merged > 0) {
        extras.push(`${enq.merged} agendamentos combinados em mensagens únicas`);
      }
      toast.success(
        `${enq.count} mensagens adicionadas à fila${extras.length ? ` — ${extras.join("; ")}` : ""}`,
      );
      setImportOpen(false);
      qc.invalidateQueries({ queryKey: ["send-queue", unitId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setImporting(false);
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
    const template = String(form.get("template") ?? "").trim();
    if (!name || !template) {
      toast.error("Nome e template obrigatórios");
      return;
    }

    if (editingMsg) {
      // Edição preserva escopo (unit_id e company_id atuais).
      const { error } = await supabase
        .from("messages")
        .update({ name, template, active: form.get("active") === "on" })
        .eq("id", editingMsg.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Salvo");
        setMsgOpen(false);
        setEditingMsg(null);
        qc.invalidateQueries({ queryKey: ["messages", unitId] });
      }
      return;
    }

    // Nova mensagem nesta unidade — pega company_id da unit e seta unit_ids.
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
      template,
      active: form.get("active") === "on",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      setMsgOpen(false);
      setEditingMsg(null);
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
    setMsgOpen(true);
  };

  const instanceMap = Object.fromEntries(instances.map((i) => [i.id, i.name]));
  const messageMap = Object.fromEntries(messages.map((m) => [m.id, m.name]));

  return (
    <AppLayout title={unit?.name ?? "Unidade"}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/units">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="instances">
        <TabsList>
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
                    {!editingInst && (
                      <p className="text-xs text-muted-foreground">
                        O nome no Evogo será gerado automaticamente como{" "}
                        <code>empresa-unidade-nome</code>.
                      </p>
                    )}
                  </div>
                  {!editingInst && (
                    <div className="space-y-2">
                      <Label>Proxy (Opcional)</Label>
                      <Input
                        name="proxy"
                        placeholder="http://usuario:senha@ip-brasileiro:porta"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Se vazio, usará o proxy configurado globalmente nas configurações.
                      </p>
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
                        <p className="text-xs text-muted-foreground">
                          URL para onde o Evogo envia eventos de mensagens, conexão, etc.
                        </p>
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
                            {advSettings.rejectCalls && (
                              <div className="space-y-2">
                                <Label htmlFor="rejectCallMessage">
                                  Mensagem ao rejeitar chamada
                                </Label>
                                <Input
                                  id="rejectCallMessage"
                                  value={advSettings.rejectCallMessage}
                                  onChange={(e) =>
                                    setAdvSettings((s) => ({
                                      ...s,
                                      rejectCallMessage: e.target.value,
                                    }))
                                  }
                                  placeholder="Não posso atender ligações por aqui."
                                />
                              </div>
                            )}
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
                <div className="flex justify-center">
                  <img
                    src={
                      qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`
                    }
                    alt="QR Code"
                    className="bg-white rounded w-60 h-60"
                  />
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  QR não disponível. Tente atualizar.
                </p>
              )}

              <p className="text-xs text-center text-muted-foreground">
                O QR Code é atualizado automaticamente a cada 5 segundos. Esta janela fecha sozinha
                quando a conexão for confirmada.
              </p>

              <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1.5">
                <p className="font-medium">Como conectar:</p>
                <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Toque em Menu ou Configurações</li>
                  <li>Toque em Dispositivos conectados</li>
                  <li>Toque em Conectar um dispositivo</li>
                  <li>Aponte seu celular para esta tela para capturar o código</li>
                </ol>
              </div>

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
                if (!o) setEditingMsg(null);
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
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Textarea
                      name="template"
                      required
                      rows={5}
                      defaultValue={editingMsg?.template}
                      placeholder="Olá {{cliente_nome}}, lembrando do seu agendamento em {{data}} às {{hora}}."
                    />
                    <details className="text-xs text-muted-foreground space-y-1">
                      <summary className="cursor-pointer select-none hover:text-foreground">
                        Variáveis e formatação do WhatsApp
                      </summary>
                      <div className="mt-2 space-y-2 pl-2 border-l border-border">
                        <div>
                          <p className="font-medium text-foreground">Variáveis disponíveis:</p>
                          <ul className="space-y-0.5">
                            <li>
                              <code>{"{{cliente_nome}}"}</code> — nome do cliente
                            </li>
                            <li>
                              <code>{"{{cliente_cod}}"}</code> — código do cliente no Belle
                            </li>
                            <li>
                              <code>{"{{data}}"}</code> — data do agendamento
                            </li>
                            <li>
                              <code>{"{{hora}}"}</code> — horário(s); múltiplos viram "08:30 e
                              09:00"
                            </li>
                            <li>
                              <code>{"{{profissional}}"}</code> — profissional(is)
                            </li>
                            <li>
                              <code>{"{{servicos}}"}</code> — serviços; múltiplos viram lista com
                              "-" (bullets no WhatsApp)
                            </li>
                            <li>
                              <code>{"{{unidade}}"}</code> — nome da unidade
                            </li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Formatação no WhatsApp:</p>
                          <ul className="space-y-0.5">
                            <li>
                              <code>*texto*</code> → <strong>negrito</strong>
                            </li>
                            <li>
                              <code>_texto_</code> → <em>itálico</em>
                            </li>
                            <li>
                              <code>~texto~</code> → <s>tachado</s>
                            </li>
                            <li>
                              <code>```texto```</code> → monoespaçado
                            </li>
                            <li>
                              <code>- item</code> no início da linha → lista com bullets
                            </li>
                            <li>
                              <code>{"> texto"}</code> no início da linha → citação
                            </li>
                          </ul>
                        </div>
                      </div>
                    </details>
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
                      <TableCell
                        className="text-muted-foreground text-sm max-w-md truncate"
                        title={m.template}
                      >
                        {m.template}
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
              {queue.filter((q) => q.status === "pending").length} pendentes,{" "}
              {queue.filter((q) => q.status === "sent").length} enviadas,{" "}
              {queue.filter((q) => q.status === "failed").length} falhas
            </p>
            <div className="flex gap-2">
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={queue.length === 0}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar fila
                  </Button>
                }
                title="Limpar toda a fila?"
                description="Todos os itens (pendentes, enviados, falhados e cancelados) serão removidos. O histórico de envios é preservado em outra tabela."
                onConfirm={clearQueue}
              />
              <Button onClick={() => setImportOpen(true)} disabled={messages.length === 0}>
                <Calendar className="h-4 w-4 mr-1" />
                Importar do Belle
              </Button>
            </div>
          </div>
          {messages.length === 0 && (
            <Card className="p-4 glass text-sm text-muted-foreground">
              Cadastre um template em Mensagens antes de importar agendamentos.
            </Card>
          )}
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
                      Nenhum item na fila. Use "Importar do Belle" para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  queue.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <div className="text-sm">{q.cliente_nome ?? "—"}</div>
                        {q.agendamento_data &&
                          typeof q.agendamento_data === "object" &&
                          !Array.isArray(q.agendamento_data) && (
                            <div className="text-xs text-muted-foreground">
                              {String(
                                (q.agendamento_data as Record<string, unknown>).dtAgenda ?? "",
                              )}{" "}
                              {String(
                                (q.agendamento_data as Record<string, unknown>).hrConsulta ?? "",
                              )}
                            </div>
                          )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{q.number}</TableCell>
                      <TableCell className="text-xs">
                        {q.message_id ? (messageMap[q.message_id] ?? "—") : "—"}
                      </TableCell>
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
                      <TableCell>
                        <Badge variant="outline" className={QUEUE_STATUS_CLASSES[q.status]}>
                          {QUEUE_STATUS_LABELS[q.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {q.status === "pending" ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Enviar agora"
                              onClick={() => dispatchQueue(q.id)}
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
                              onConfirm={() => cancelQueue(q.id)}
                            />
                          </>
                        ) : null}
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
              Crons rodam a cada 5 min e disparam quando o horário cair na janela.
            </p>
            <Button onClick={() => openCronDialog()} disabled={messages.length === 0}>
              <Plus className="h-4 w-4 mr-1" />
              Nova automação
            </Button>
          </div>
          {messages.length === 0 && (
            <Card className="p-4 glass text-sm text-muted-foreground">
              Cadastre um template em Mensagens antes de criar automações.
            </Card>
          )}
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome / Template</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Auto-enviar</TableHead>
                  <TableHead>Última execução</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cronLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : cronJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma automação configurada
                    </TableCell>
                  </TableRow>
                ) : (
                  cronJobs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {messageMap[c.message_id] ?? "Template removido"}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.schedule_time}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDays(c.days_of_week)}
                      </TableCell>
                      <TableCell>
                        {c.auto_dispatch ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                          >
                            Sim
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            Só fila
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.last_run_at ? (
                          <span title={c.last_run_error ?? ""}>
                            {new Date(c.last_run_at).toLocaleString("pt-BR")}
                            {c.last_run_status === "error" && (
                              <span className="text-destructive ml-1">⚠</span>
                            )}
                            {typeof c.last_run_count === "number" && c.last_run_count > 0 && (
                              <span className="ml-1">({c.last_run_count})</span>
                            )}
                          </span>
                        ) : (
                          "Nunca"
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch checked={c.active} onCheckedChange={() => toggleCron(c)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Rodar agora"
                          onClick={() => runCronNow(c)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => openCronDialog(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button size="icon" variant="ghost" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Excluir automação?"
                          onConfirm={() => deleteCron(c.id)}
                        />
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
                  <TableHead className="w-44">Quando</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : sendLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum envio registrado
                    </TableCell>
                  </TableRow>
                ) : (
                  sendLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(log.sent_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {instanceMap[log.instance_id] ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.message_id ? (
                          <span className="text-foreground">
                            {messageMap[log.message_id] ?? "Template removido"}
                          </span>
                        ) : (
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
                            title={log.error ?? ""}
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
        </TabsContent>
      </Tabs>

      <Dialog open={cronOpen} onOpenChange={setCronOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {editingCron ? "Editar automação" : "Nova automação"}
            </DialogTitle>
            <DialogDescription>
              Roda no horário e dias selecionados. Data dos agendamentos é calculada automaticamente
              a partir do <code>days_offset</code> do template.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCron} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cronName">Nome (opcional)</Label>
              <Input
                id="cronName"
                value={cronName}
                onChange={(e) => setCronName(e.target.value)}
                placeholder="Ex: Lembrete diário"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={cronTemplate} onValueChange={setCronTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {messages.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Instância de envio</Label>
                <Select value={cronInstance} onValueChange={setCronInstance}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quando buscar agendamentos</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={cronDaysQty}
                  onChange={(e) => setCronDaysQty(Math.max(0, parseInt(e.target.value || "0", 10)))}
                  disabled={cronDaysDir === "same"}
                  className="w-20"
                />
                <Select
                  value={cronDaysDir}
                  onValueChange={(v) => setCronDaysDir(v as "before" | "after" | "same")}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">dia(s) antes</SelectItem>
                    <SelectItem value="after">dia(s) depois</SelectItem>
                    <SelectItem value="same">no mesmo dia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cronTime">Horário (Brasil)</Label>
                <Input
                  id="cronTime"
                  type="time"
                  value={cronTime}
                  onChange={(e) => setCronTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Atalhos de dias</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCronDays([0, 1, 2, 3, 4, 5, 6])}
                  >
                    Todos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCronDays([1, 2, 3, 4, 5])}
                  >
                    Úteis
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex gap-1">
                {DAY_FULL.map((label, idx) => {
                  const checked = cronDays.includes(idx);
                  return (
                    <Button
                      key={idx}
                      type="button"
                      size="sm"
                      variant={checked ? "default" : "outline"}
                      className="flex-1"
                      title={label}
                      onClick={() =>
                        setCronDays((prev) =>
                          checked ? prev.filter((d) => d !== idx) : [...prev, idx].sort(),
                        )
                      }
                    >
                      {DAY_LABELS[idx]}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Filtrar por status (opcional)</Label>
                <Select value={cronStatus} onValueChange={setCronStatus}>
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
                <Label>Filtrar por tipo (opcional)</Label>
                <Select value={cronTipo} onValueChange={setCronTipo}>
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
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="autoDispatch" className="font-normal">
                    Enviar automaticamente após importar
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se desativado, mensagens ficam pendentes no Gerenciador.
                  </p>
                </div>
                <Switch
                  id="autoDispatch"
                  checked={cronAutoDispatch}
                  onCheckedChange={setCronAutoDispatch}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="cronActive" className="font-normal">
                  Ativa
                </Label>
                <Switch id="cronActive" checked={cronActive} onCheckedChange={setCronActive} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={cronSubmitting}>
                {cronSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Importar agendamentos do Belle
            </DialogTitle>
            <DialogDescription>
              Busca os agendamentos do período e gera mensagens pendentes na fila usando o template
              selecionado.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitImport} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={importTemplate} onValueChange={setImportTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {messages.map((m) => (
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
                    {instances.map((i) => (
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
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

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar mensagem
            </DialogTitle>
            <DialogDescription>
              Envio de teste — escolha a instância e o destinatário.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSend} className="space-y-4">
            <div className="space-y-2">
              <Label>Instância</Label>
              <Select
                value={sendInstance?.id ?? ""}
                onValueChange={(id) => {
                  const inst = instances.find((i) => i.id === id);
                  if (inst) setSendInstance({ id: inst.id, name: inst.name });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.status !== "connected" && (
                        <span className="text-muted-foreground text-xs ml-2">
                          ({STATUS_LABELS[i.status]})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendNumber">Número (com DDI e DDD)</Label>
              <Input
                id="sendNumber"
                value={sendNumber}
                onChange={(e) => setSendNumber(e.target.value)}
                placeholder="5511999999999"
                inputMode="tel"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Aceita formatado (ex: +55 11 99999-9999) — só os dígitos vão pra Evolution.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendText">Mensagem</Label>
              <Textarea
                id="sendText"
                rows={4}
                value={sendText}
                onChange={(e) => setSendText(e.target.value)}
                placeholder="Digite a mensagem..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sendDelay">Delay antes de enviar (ms)</Label>
              <Input
                id="sendDelay"
                type="number"
                min={0}
                max={60000}
                step={100}
                value={sendDelay}
                onChange={(e) => setSendDelay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Simula tempo de digitação. 0 envia imediatamente.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sendSubmitting}>
                {sendSubmitting ? "Enviando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
