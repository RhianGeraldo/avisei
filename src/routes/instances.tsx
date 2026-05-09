import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Pencil, Trash2, QrCode, RefreshCw, LogOut, Send } from "lucide-react";
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
} from "@/lib/evogo";

export const Route = createFileRoute("/instances")({ component: InstancesPage });

type InstanceStatus = Database["public"]["Enums"]["instance_status"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type InstanceWithUnit = InstanceRow & {
  units: { id: string; name: string } | null;
};

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

function InstancesPage() {
  const qc = useQueryClient();

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

  // Create / edit
  const [instOpen, setInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<InstanceWithUnit | null>(null);
  const [newUnitId, setNewUnitId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // QR
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInstance, setQrInstance] = useState<{ id: string; name: string } | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Send
  const [sendOpen, setSendOpen] = useState(false);
  const [sendInstance, setSendInstance] = useState<{ id: string; name: string } | null>(null);
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendDelay, setSendDelay] = useState("0");
  const [sendSubmitting, setSendSubmitting] = useState(false);

  // Edit form: webhook + advanced
  const [webhookUrl, setWebhookUrl] = useState("");
  const [advLoading, setAdvLoading] = useState(false);
  const [advSettings, setAdvSettings] = useState({
    rejectCalls: false,
    rejectCallMessage: "",
    readMessages: false,
    readStatus: false,
    alwaysOnline: false,
  });

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

  // QR auto-poll
  useEffect(() => {
    if (!qrOpen || !qrInstance) return;
    const id = setInterval(() => {
      fetchEvogoQrCode({ data: { instanceId: qrInstance.id } })
        .then((res) => {
          if (res.connected) {
            toast.success("WhatsApp conectado!");
            setQrOpen(false);
            qc.invalidateQueries({ queryKey: ["all-instances"] });
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
        if (!newUnitId) {
          toast.error("Selecione a unidade");
          return;
        }
        const res = await createEvogoInstance({
          data: { unitId: newUnitId, name, proxy: proxyOverride || undefined },
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
      setNewUnitId("");
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
      toast.success(`Status: ${res.status}`);
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

  const openSend = (inst: InstanceWithUnit) => {
    setSendInstance({ id: inst.id, name: inst.name });
    setSendNumber("");
    setSendText("");
    setSendDelay("0");
    setSendOpen(true);
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
        data: { instanceId: sendInstance.id, number, text, delay },
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
          Todas as instâncias cadastradas em todas as unidades.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAllStatus} disabled={instances.length === 0}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar status
          </Button>
          <Button onClick={() => setInstOpen(true)} disabled={units.length === 0}>
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
              <TableHead>Unidade</TableHead>
              <TableHead>Instância Evogo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-64 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma instância cadastrada
                </TableCell>
              </TableRow>
            ) : (
              instances.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="text-muted-foreground">{i.units?.name ?? "—"}</TableCell>
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

      {/* Dialog Criar/Editar */}
      <Dialog
        open={instOpen}
        onOpenChange={(o) => {
          setInstOpen(o);
          if (!o) {
            setEditingInst(null);
            setNewUnitId("");
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
                <Label>Unidade</Label>
                <Select value={newUnitId} onValueChange={setNewUnitId}>
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
            )}
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
                  O nome no Evogo será gerado automaticamente como <code>empresa-unidade-nome</code>
                  .
                </p>
              )}
            </div>
            {!editingInst && (
              <div className="space-y-2">
                <Label>Proxy (Opcional)</Label>
                <Input name="proxy" placeholder="http://usuario:senha@ip-brasileiro:porta" />
                <p className="text-[10px] text-muted-foreground">
                  Se vazio, usará o proxy configurado globalmente nas configurações.
                </p>
              </div>
            )}
            {editingInst && (
              <>
                <div className="flex items-center gap-2">
                  <Switch name="active" defaultChecked={editingInst.active ?? true} id="iact" />
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
                          onCheckedChange={(v) => setAdvSettings((s) => ({ ...s, readStatus: v }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="rejectCalls" className="font-normal">
                          Rejeitar chamadas
                        </Label>
                        <Switch
                          id="rejectCalls"
                          checked={advSettings.rejectCalls}
                          onCheckedChange={(v) => setAdvSettings((s) => ({ ...s, rejectCalls: v }))}
                        />
                      </div>
                      {advSettings.rejectCalls && (
                        <div className="space-y-2">
                          <Label htmlFor="rejectCallMessage">Mensagem ao rejeitar chamada</Label>
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

      {/* QR Dialog */}
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
                src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code"
                className="bg-white rounded w-60 h-60"
              />
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12">QR não disponível.</p>
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
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
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
