"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, QrCode, RefreshCw, LogOut, Send, Smartphone, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createEvogoInstance,
  fetchEvogoQrCode,
  fetchEvogoStatus,
  logoutEvogoInstance,
  deleteEvogoInstance,
  fetchEvogoAdvancedSettings,
  updateEvogoAdvancedSettings,
  fetchEvogoFullSettings,
  updateEvogoConnectionSettings,
  sendEvogoMessage,
} from "@/lib/evogo";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { FileText, Image as ImageIcon, ListFilter, MapPin, MousePointer2, Phone, Smile, MessageSquare, LayoutTemplate, Link as LinkIcon, Upload, Loader2, Globe } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type InstanceStatus = Database["public"]["Enums"]["instance_status"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type InstanceWithUnit = InstanceRow & {
  units: { id: string; name: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Conectado",
  connecting: "Conectando",
  disconnected: "Desconectado",
  failed: "Falha",
};

const STATUS_CLASSES: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  connecting: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  disconnected: "bg-muted/50 text-muted-foreground border-muted-foreground/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function InstancesPage() {
  const qc = useQueryClient();
  const { companyId } = useAuth();

  const { data: units = [] } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: instances = [] } = useQuery<InstanceWithUnit[]>({
    queryKey: ["all-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("*, units(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InstanceWithUnit[];
    },
  });

  const [instOpen, setInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<InstanceWithUnit | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [newUnitId, setNewUnitId] = useState<string>("geral"); // Default para Geral
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (companyId) {
      setActiveCompanyId(companyId);
    } else {
      // Fallback para a primeira empresa se o perfil estiver desvinculado
      supabase
        .from("companies")
        .select("id")
        .order("created_at")
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.id) setActiveCompanyId(data.id);
        });
    }
  }, [companyId]);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrInstance, setQrInstance] = useState<{ id: string; name: string } | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendInstance, setSendInstance] = useState<{ id: string; name: string } | null>(null);
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendDelay, setSendDelay] = useState("0");
  const [messageType, setMessageType] = useState<string>("text");
  const [contentData, setContentData] = useState<any>({});
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [advSettings, setAdvSettings] = useState({
    rejectCalls: false,
    rejectCallMessage: "",
    readMessages: false,
    readStatus: false,
    alwaysOnline: false,
    ignoreGroups: false,
    ignoreStatus: false,
  });
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["ALL"]);
  const [protocolSettings, setProtocolSettings] = useState({
    websocketEnable: "disabled",
    rabbitmqEnable: "disabled",
    natsEnable: "disabled",
  });
  const [advLoading, setAdvLoading] = useState(false);

  useEffect(() => {
    if (!editingInst) return;
    setWebhookUrl(editingInst.webhook_url ?? "");
    setAdvLoading(true);
    
    // Buscar configurações completas (incluindo webhook e protocolos)
    fetchEvogoFullSettings({ data: { instanceId: editingInst.id } })
      .then((cfg) => {
        setWebhookUrl(cfg.webhook || "");
        // Se events for uma string como "MESSAGE,CALL", transformamos em array
        const events = typeof cfg.events === 'string' ? cfg.events.split(",").filter(Boolean) : [];
        setWebhookEvents(events);
        
        setProtocolSettings({
          websocketEnable: cfg.websocketEnable || "default",
          rabbitmqEnable: cfg.rabbitmqEnable || "default",
          natsEnable: cfg.natsEnable || "default",
        });

        // Configurações avançadas também vêm no info
        setAdvSettings({
          alwaysOnline: cfg.alwaysOnline ?? false,
          rejectCall: cfg.rejectCall ?? false,
          rejectCalls: cfg.rejectCall ?? false, // Mapear ambos por segurança
          rejectCallMessage: cfg.msgRejectCall || "",
          readMessages: cfg.readMessages ?? false,
          readStatus: cfg.readStatus ?? false,
          ignoreGroups: cfg.ignoreGroups ?? false,
          ignoreStatus: cfg.ignoreStatus ?? false,
        });
      })
      .catch((err) => {
        console.warn("[evogo] fetch full settings falhou", err);
      })
      .finally(() => setAdvLoading(false));
  }, [editingInst]);

  useEffect(() => {
    if (!qrOpen || !qrInstance) return;
    const id = setInterval(() => {
      fetchEvogoQrCode({ data: { instanceId: qrInstance.id } })
        .then((res) => {
          if (res.connected) {
            toast.success("WhatsApp conectado!");
            setQrOpen(false);
            // Forçar atualização do status no banco antes de recarregar a lista
            fetchEvogoStatus({ data: { instanceId: qrInstance.id } }).finally(() => {
              qc.invalidateQueries({ queryKey: ["all-instances"] });
            });
          } else if (res.qrBase64) {
            setQrBase64(res.qrBase64);
          }
        })
        .catch((err) => console.warn("[evogo] poll falhou", err));
    }, 5000);
    return () => clearInterval(id);
  }, [qrOpen, qrInstance, qc]);

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
        const { error: dbError } = await supabase
          .from("instances")
          .update({ name, active: form.get("active") === "on", webhook_url: webhookUrl })
          .eq("id", editingInst.id);
        if (dbError) throw dbError;

        // 2. Atualizar Configurações de Conexão/Webhook no EvoGo
        await updateEvogoConnectionSettings({
          data: { 
            instanceId: editingInst.id, 
            settings: {
              webhookUrl,
              subscribe: webhookEvents,
              websocketEnable: protocolSettings.websocketEnable === "default" ? "" : protocolSettings.websocketEnable,
              rabbitmqEnable: protocolSettings.rabbitmqEnable === "default" ? "" : protocolSettings.rabbitmqEnable,
              natsEnable: protocolSettings.natsEnable === "default" ? "" : protocolSettings.natsEnable,
            } 
          },
        });

        // 3. Atualizar Configurações Avançadas no EvoGo
        await updateEvogoAdvancedSettings({
          data: { instanceId: editingInst.id, settings: advSettings },
        });

        toast.success("Instância atualizada");
      } else {
        if (!activeCompanyId) {
          toast.error("Sua conta não está vinculada a nenhuma empresa. Não é possível criar instâncias.");
          return;
        }
        const res = await createEvogoInstance({
          data: { 
            unitId: newUnitId === "geral" ? null : newUnitId, 
            companyId: activeCompanyId,
            name, 
            proxy: proxyOverride || undefined 
          },
        });
        toast.success("Instância criada. Escaneie o QR para conectar.");
        if (res.qrBase64) {
          setQrInstance({ id: res.id, name: name });
          setQrBase64(res.qrBase64);
          setQrOpen(true);
        }
      }
      setInstOpen(false);
      setEditingInst(null);
      setNewUnitId("geral");
      qc.invalidateQueries({ queryKey: ["all-instances"] });
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
      qc.invalidateQueries({ queryKey: ["all-instances"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
    }
  };

  const openQr = async (inst: InstanceWithUnit) => {
    setQrInstance({ id: inst.id, name: inst.instance_name });
    setQrBase64(null);
    setQrOpen(true);
    setQrLoading(true);
    try {
      const res = await fetchEvogoQrCode({ data: { instanceId: inst.id } });
      if (res.connected) {
        toast.success("WhatsApp já está conectado");
        setQrOpen(false);
        qc.invalidateQueries({ queryKey: ["all-instances"] });
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
      const statusText = res.status || res.state || res.connection || (typeof res === 'string' ? res : JSON.stringify(res));
      toast.success(`Status: ${statusText}`);
      qc.invalidateQueries({ queryKey: ["all-instances"] });
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
    qc.invalidateQueries({ queryKey: ["all-instances"] });
    const fails = results.filter((r) => r.status === "rejected").length;
    if (fails === 0) toast.success("Status atualizado");
    else toast.warning(`${results.length - fails} ok, ${fails} falharam`);
  };

  const doLogout = async (id: string) => {
    try {
      await logoutEvogoInstance({ data: { instanceId: id } });
      toast.success("Desconectada");
      qc.invalidateQueries({ queryKey: ["all-instances"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desconectar");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data, error } = await supabase.storage
        .from("messages")
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("messages")
        .getPublicUrl(filePath);

      setContentData((prev: any) => ({ ...prev, url: publicUrl, filename: file.name }));
      toast.success("Arquivo enviado com sucesso!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const openSend = (inst: InstanceWithUnit) => {
    setSendInstance({ id: inst.id, name: inst.name });
    setSendNumber("");
    setSendText("");
    setSendDelay("0");
    setMessageType("text");
    setContentData({});
    setSendOpen(true);
  };

  const submitSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendInstance) return;
    const text = sendText.trim();
    const number = sendNumber.trim();
    
    if (!number) {
      toast.error("O número de destino é obrigatório");
      return;
    }

    if ((messageType === "text" || messageType === "button" || messageType === "list") && !text) {
      toast.error("O texto da mensagem é obrigatório");
      return;
    }

    if (messageType === "media" && !contentData.url) {
      toast.error("A URL da mídia é obrigatória");
      return;
    }

    if (messageType === "poll") {
      if (!text) {
        toast.error("A pergunta da enquete é obrigatória");
        return;
      }
      const options = contentData.pollOptions || [];
      if (options.filter((o: string) => o.trim()).length < 2) {
        toast.error("A enquete precisa de pelo menos 2 opções");
        return;
      }
    }

    if (messageType === "location" && (!contentData.latitude || !contentData.longitude)) {
      toast.error("Latitude e Longitude são obrigatórias");
      return;
    }

    if (messageType === "contact") {
      const contacts = contentData.contacts || [];
      if (contacts.length === 0 || !contacts[0].fullName || !contacts[0].phone) {
        toast.error("Adicione pelo menos um contato com nome e telefone");
        return;
      }
    }

    if (messageType === "sticker" && !contentData.url) {
      toast.error("A URL do sticker é obrigatória");
      return;
    }

    if (messageType === "button" && (!contentData.buttons || contentData.buttons.length === 0)) {
      toast.error("Adicione pelo menos um botão");
      return;
    }

    if (messageType === "list" && (!contentData.sections?.[0]?.rows || contentData.sections[0].rows.length === 0)) {
      toast.error("Adicione pelo menos um item à lista");
      return;
    }

    if (messageType === "carousel" && (!contentData.cards || contentData.cards.length === 0)) {
      toast.error("Adicione pelo menos um card ao carrossel");
      return;
    }
    const delay = Math.max(0, parseInt(sendDelay || "0", 10) || 0);
    setSendSubmitting(true);
    try {
      const res = await sendEvogoMessage({
        data: { 
          instanceId: sendInstance.id, 
          number, 
          text, 
          delay,
          messageType,
          ...contentData
        },
      });
      toast.success(`Mensagem enviada para ${res.number}`);
      setSendOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSendSubmitting(false);
    }
  };

  return (
    <AppLayout title="Instâncias">
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted-foreground">
          Gerencie suas instâncias do WhatsApp. Instâncias "Gerais" podem ser usadas em qualquer campanha.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAllStatus} disabled={instances.length === 0}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar status
          </Button>
          <Button onClick={() => setInstOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova instância
          </Button>
        </div>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Instância Evogo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-64 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <Smartphone className="h-12 w-12" />
                    <p>Nenhuma instância cadastrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              instances.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>
                    {i.units ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          {i.units.name}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="bg-emerald-500/5 text-emerald-500 border-emerald-500/20">
                          <Globe className="h-3 w-3 mr-1" /> Geral
                        </Badge>
                      </div>
                    )}
                  </TableCell>
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
                    <Button size="icon" variant="ghost" title="QR Code" onClick={() => openQr(i)}>
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
                      disabled={i.status !== "connected"}
                      trigger={
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          title="Desconectar" 
                          disabled={i.status !== "connected"}
                          className={i.status !== "connected" ? "opacity-30 pointer-events-none" : ""}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      }
                      title="Desconectar instância?"
                      description="A sessão WhatsApp será encerrada. A instância continua existindo para reconectar."
                      confirmText="Desconectar"
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
                      description="A instância será removida do Evogo e desta plataforma."
                      onConfirm={() => deleteInstance(i.id)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={instOpen}
        onOpenChange={(o) => {
          setInstOpen(o);
          if (!o) {
            setEditingInst(null);
            setNewUnitId("geral");
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInst ? "Editar" : "Nova"} instância Evogo</DialogTitle>
          </DialogHeader>
          <form action={submitInstance} className="space-y-4">
            {!editingInst && (
              <div className="space-y-2">
                <Label>Vincular a Unidade (Opcional)</Label>
                <Select value={newUnitId} onValueChange={setNewUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Instância Geral (Não vinculada)</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Instâncias gerais podem ser usadas em qualquer campanha.
                </p>
              </div>
            )}
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
                <Input name="proxy" placeholder="http://usuario:senha@ip-brasileiro:porta" />
              </div>
            )}
            {editingInst && (
              <>
                <div className="flex items-center gap-2">
                  <Switch name="active" defaultChecked={editingInst.active ?? true} id="iact" />
                  <Label htmlFor="iact">Ativa</Label>
                </div>

                <div className="space-y-4 pt-4 border-t border-border">
                  <p className="text-sm font-semibold">Configurações de Webhook</p>
                  <div className="space-y-2">
                    <Label htmlFor="webhook">URL do Webhook</Label>
                    <Input
                      id="webhook"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://seu-servico.com/api/webhook"
                      disabled={advLoading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs">Eventos para Webhook</Label>
                    <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-lg border border-border">
                      {["ALL", "MESSAGE", "READ_RECEIPT", "PRESENCE", "HISTORY_SYNC", "CHAT_PRESENCE", "CALL", "CONNECTION", "QRCODE", "GROUP", "NEWSLETTER"].map((event) => (
                        <div key={event} className="flex items-center gap-2">
                          <Checkbox 
                            id={`ev-${event}`}
                            checked={webhookEvents.includes("ALL") || webhookEvents.includes(event)}
                            disabled={webhookEvents.includes("ALL") && event !== "ALL"}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                if (event === "ALL") setWebhookEvents(["ALL"]);
                                else setWebhookEvents(prev => [...prev.filter(e => e !== "ALL"), event]);
                              } else {
                                setWebhookEvents(prev => prev.filter(e => e !== event));
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`ev-${event}`} 
                            className={`text-[10px] font-normal cursor-pointer uppercase ${webhookEvents.includes("ALL") && event !== "ALL" ? 'opacity-50' : ''}`}
                          >
                            {event}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">RabbitMQ</Label>
                    <Select 
                      value={protocolSettings.rabbitmqEnable} 
                      onValueChange={(v) => setProtocolSettings(s => ({...s, rabbitmqEnable: v}))}
                    >
                      <SelectTrigger className="h-8 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão</SelectItem>
                        <SelectItem value="enabled">Habilitado</SelectItem>
                        <SelectItem value="disabled">Desabilitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">WebSocket</Label>
                    <Select 
                      value={protocolSettings.websocketEnable} 
                      onValueChange={(v) => setProtocolSettings(s => ({...s, websocketEnable: v}))}
                    >
                      <SelectTrigger className="h-8 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão</SelectItem>
                        <SelectItem value="enabled">Habilitado</SelectItem>
                        <SelectItem value="disabled">Desabilitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">NATS</Label>
                    <Select 
                      value={protocolSettings.natsEnable} 
                      onValueChange={(v) => setProtocolSettings(s => ({...s, natsEnable: v}))}
                    >
                      <SelectTrigger className="h-8 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Padrão</SelectItem>
                        <SelectItem value="enabled">Habilitado</SelectItem>
                        <SelectItem value="disabled">Desabilitado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border">
                  <p className="text-sm font-semibold">Configurações Avançadas</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[
                      { id: "alwaysOnline", label: "Sempre Online", key: "alwaysOnline" },
                      { id: "rejectCall", label: "Rejeitar Chamadas", key: "rejectCall" },
                      { id: "readMessages", label: "Marcar como Lidas", key: "readMessages" },
                      { id: "ignoreGroups", label: "Ignorar Grupos", key: "ignoreGroups" },
                      { id: "ignoreStatus", label: "Ignorar Status", key: "ignoreStatus" },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <Label htmlFor={item.id} className="text-xs font-normal">{item.label}</Label>
                        <Switch
                          id={item.id}
                          checked={(advSettings as any)[item.key]}
                          onCheckedChange={(v) => setAdvSettings(s => ({ ...s, [item.key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
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
                  src={qrBase64.startsWith("data:") || qrBase64.startsWith("http") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
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
            <p className="text-center text-muted-foreground py-12">QR não disponível.</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!qrInstance || qrLoading}
              onClick={() => qrInstance && openQr(instances.find(i => i.id === qrInstance.id)!)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar mensagem de teste
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitSend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sendNumber">Número</Label>
              <Input
                id="sendNumber"
                value={sendNumber}
                onChange={(e) => setSendNumber(e.target.value)}
                placeholder="5511999999999"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de Mensagem</Label>
              <Tabs value={messageType} onValueChange={setMessageType} className="w-full">
                <TabsList className="grid grid-cols-3 h-auto gap-1 bg-transparent p-0">
                  <TabsTrigger value="text" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border"><FileText className="h-4 w-4 mr-1" />Texto</TabsTrigger>
                  <TabsTrigger value="media" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border"><ImageIcon className="h-4 w-4 mr-1" />Mídia</TabsTrigger>
                  <TabsTrigger value="poll" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border"><ListFilter className="h-4 w-4 mr-1" />Enquete</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-4 pt-2 border-t">
              {messageType === "media" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>URL da Mídia</Label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="https://..." 
                          value={contentData.url || ""} 
                          onChange={(e) => setContentData({ ...contentData, url: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={uploading}
                          onClick={() => document.getElementById("media-upload-test")?.click()}
                        >
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        </Button>
                        <input
                          id="media-upload-test"
                          type="file"
                          className="hidden"
                          accept={
                            contentData.mediaType === "image" ? "image/*" :
                            contentData.mediaType === "video" ? "video/*" :
                            contentData.mediaType === "audio" ? "audio/*" :
                            "*"
                          }
                          onChange={handleFileUpload}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select 
                        value={contentData.mediaType || "image"} 
                        onValueChange={(v) => setContentData({ ...contentData, mediaType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">Imagem</SelectItem>
                          <SelectItem value="video">Vídeo</SelectItem>
                          <SelectItem value="document">Documento</SelectItem>
                          <SelectItem value="audio">Áudio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {messageType === "poll" && (
                <div className="space-y-2">
                  <Label>Opções da Enquete (Pelo menos 2)</Label>
                  <div className="space-y-2">
                    {(contentData.pollOptions || ["", ""]).map((opt: string, i: number) => (
                      <div key={i} className="flex gap-2">
                        <Input 
                          placeholder={`Opção ${i + 1}`} 
                          value={opt} 
                          onChange={(e) => {
                            const newOpts = [...(contentData.pollOptions || ["", ""])];
                            newOpts[i] = e.target.value;
                            setContentData({ ...contentData, pollOptions: newOpts });
                          }}
                        />
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          disabled={(contentData.pollOptions || ["", ""]).length <= 2}
                          onClick={() => {
                            const newOpts = (contentData.pollOptions || ["", ""]).filter((_: any, idx: number) => idx !== i);
                            setContentData({ ...contentData, pollOptions: newOpts });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => {
                        const newOpts = [...(contentData.pollOptions || ["", ""]), ""];
                        setContentData({ ...contentData, pollOptions: newOpts });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Opção
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>
                  {messageType === "media" ? "Legenda (opcional)" : 
                   messageType === "poll" ? "Pergunta" : 
                   "Mensagem"}
                </Label>
                <Textarea
                  id="sendText"
                  rows={4}
                  value={sendText}
                  onChange={(e) => setSendText(e.target.value)}
                  placeholder={
                    messageType === "text" ? "Digite a mensagem..." : 
                    "Legenda opcional..."
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={sendSubmitting || uploading}>
                {sendSubmitting ? "Enviando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
