import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Send } from "lucide-react";
import { sendEvogoText } from "@/lib/evogo";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/messages")({ component: MessagesPage });

type InstanceStatus = Database["public"]["Enums"]["instance_status"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
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

async function resolveCompanyId(authCompanyId: string | null): Promise<string> {
  if (authCompanyId) return authCompanyId;
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created, error } = await supabase
    .from("companies")
    .insert({ name: "Padrão" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

function MessagesPage() {
  const qc = useQueryClient();
  const { companyId } = useAuth();

  const { data: units = [] } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: messages = [], isLoading } = useQuery<MessageRow[]>({
    queryKey: ["all-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const { data: instances = [] } = useQuery<InstanceWithUnit[]>({
    queryKey: ["all-instances-for-send"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("*, units(id, name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as InstanceWithUnit[];
    },
  });

  // Create / edit
  const [msgOpen, setMsgOpen] = useState(false);
  const [editingMsg, setEditingMsg] = useState<MessageRow | null>(null);
  const [scope, setScope] = useState<"shared" | "unit">("shared");
  const [newUnitId, setNewUnitId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Send dialog
  const [sendOpen, setSendOpen] = useState(false);
  const [sendInstance, setSendInstance] = useState<{ id: string; name: string } | null>(null);
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendDelay, setSendDelay] = useState("0");
  const [sendMessageId, setSendMessageId] = useState<string | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);

  const submitMessage = async (form: FormData) => {
    const name = String(form.get("name") ?? "").trim();
    const template = String(form.get("template") ?? "").trim();
    if (!name || !template) {
      toast.error("Nome e template são obrigatórios");
      return;
    }
    if (scope === "unit" && !newUnitId && (!editingMsg?.unit_ids || editingMsg.unit_ids.length === 0)) {
      toast.error("Selecione a unidade");
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCompanyId: string;
      if (editingMsg) {
        resolvedCompanyId = editingMsg.company_id;
      } else if (scope === "unit") {
        const u = units.find((x) => x.id === newUnitId);
        if (!u) throw new Error("Unidade inválida");
        // Pega company_id da unidade
        const { data: unitFull } = await supabase
          .from("units")
          .select("company_id")
          .eq("id", u.id)
          .maybeSingle();
        if (!unitFull?.company_id) throw new Error("Unidade sem empresa vinculada");
        resolvedCompanyId = unitFull.company_id;
      } else {
        resolvedCompanyId = await resolveCompanyId(companyId);
      }

      const unit_ids = scope === "shared" ? [] : newUnitId ? [newUnitId] : editingMsg?.unit_ids || [];
      const payload = {
        company_id: resolvedCompanyId,
        unit_ids,
        name,
        template,
        active: form.get("active") === "on",
      };
      const res = editingMsg
        ? await supabase
            .from("messages")
            .update({ unit_ids, name, template, active: payload.active })
            .eq("id", editingMsg.id)
        : await supabase.from("messages").insert(payload);
      if (res.error) throw new Error(res.error.message);
      toast.success(editingMsg ? "Atualizada" : "Criada");
      setMsgOpen(false);
      setEditingMsg(null);
      setNewUnitId("");
      setScope("shared");
      qc.invalidateQueries({ queryKey: ["all-messages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["all-messages"] });
    }
  };

  const openSendFromTemplate = (m: MessageRow) => {
    // Pega instâncias da mesma unidade do template; se não houver, qualquer conectada.
    const sameUnit = instances.filter((i) => m.unit_ids.includes(i.unit_id));
    const inst =
      sameUnit.find((i) => i.status === "connected") ??
      sameUnit[0] ??
      instances.find((i) => i.status === "connected") ??
      instances[0];
    if (!inst) {
      toast.error("Cadastre uma instância primeiro");
      return;
    }
    setSendInstance({ id: inst.id, name: inst.name });
    setSendNumber("");
    setSendText(m.template);
    setSendDelay("0");
    setSendMessageId(m.id);
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setSendSubmitting(false);
    }
  };

  return (
    <AppLayout title="Mensagens">
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted-foreground">
          Templates de mensagens cadastrados em todas as unidades.
        </p>
        <Button onClick={() => setMsgOpen(true)} disabled={units.length === 0}>
          <Plus className="h-4 w-4 mr-1" />
          Nova mensagem
        </Button>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead>Texto (preview)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>Carregando...</TableCell>
              </TableRow>
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma mensagem cadastrada
                </TableCell>
              </TableRow>
            ) : (
              messages.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    {m.unit_ids && m.unit_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {m.unit_ids.map((id) => {
                          const u = units.find((u) => u.id === id);
                          return (
                            <Badge
                              key={id}
                              variant="outline"
                              className="bg-muted text-muted-foreground border-border"
                            >
                              {u?.name ?? "Unidade removida"}
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      >
                        Compartilhada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-md">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="truncate cursor-default">{m.template}</div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="start"
                        className="max-w-md whitespace-pre-wrap break-words bg-popover text-popover-foreground border border-border shadow-lg p-3 text-sm"
                      >
                        {m.template}
                      </TooltipContent>
                    </Tooltip>
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
                      onClick={() => {
                        setEditingMsg(m);
                        setScope(m.unit_ids && m.unit_ids.length > 0 ? "unit" : "shared");
                        setNewUnitId(m.unit_ids && m.unit_ids.length > 0 ? m.unit_ids[0] : "");
                        setMsgOpen(true);
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

      {/* Create / Edit Dialog */}
      <Dialog
        open={msgOpen}
        onOpenChange={(o) => {
          setMsgOpen(o);
          if (!o) {
            setEditingMsg(null);
            setNewUnitId("");
            setScope("shared");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMsg ? "Editar" : "Nova"} mensagem</DialogTitle>
          </DialogHeader>
          <form action={submitMessage} className="space-y-4">
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "shared" | "unit")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Compartilhada (todas as unidades)</SelectItem>
                  <SelectItem value="unit">Específica de uma unidade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "unit" && (
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
                rows={10}
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
                        <code>{"{{cliente_p_nome}}"}</code> — primeiro nome do cliente
                      </li>
                      <li>
                        <code>{"{{cliente_cod}}"}</code> — código do cliente no Belle
                      </li>
                      <li>
                        <code>{"{{data}}"}</code> — data do agendamento
                      </li>
                      <li>
                        <code>{"{{hora}}"}</code> — horário(s); múltiplos viram "08:30 e 09:00"
                      </li>
                      <li>
                        <code>{"{{profissional}}"}</code> — profissional(is)
                      </li>
                      <li>
                        <code>{"{{servicos}}"}</code> — serviços; múltiplos viram lista com "-"
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
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
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
                      <span className="text-muted-foreground text-xs ml-2">
                        ({i.units?.name ?? "—"}
                        {i.status !== "connected" ? ` • ${STATUS_LABELS[i.status]}` : ""})
                      </span>
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
                rows={5}
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
