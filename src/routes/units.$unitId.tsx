import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowLeft, Smartphone, MessageSquareMore } from "lucide-react";

export const Route = createFileRoute("/units/$unitId")({ component: UnitDetailPage });

const TRIGGER_LABELS: Record<string, string> = {
  appointment_reminder: "Lembrete de agendamento",
  appointment_confirmation: "Confirmação de agendamento",
  installment_due: "Parcela a vencer",
  installment_overdue: "Parcela em atraso",
  custom: "Personalizado",
};

function UnitDetailPage() {
  const { unitId } = Route.useParams();
  const qc = useQueryClient();

  const { data: unit } = useQuery({
    queryKey: ["unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").eq("id", unitId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: instances = [] } = useQuery({
    queryKey: ["instances", unitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("instances").select("*").eq("unit_id", unitId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", unitId],
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("*").eq("unit_id", unitId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const [instOpen, setInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<any>(null);
  const [msgOpen, setMsgOpen] = useState(false);
  const [editingMsg, setEditingMsg] = useState<any>(null);
  const [msgInstance, setMsgInstance] = useState<string>("");
  const [msgTrigger, setMsgTrigger] = useState<string>("appointment_reminder");

  const submitInstance = async (form: FormData) => {
    const payload = {
      unit_id: unitId,
      name: String(form.get("name") ?? "").trim(),
      evogo_url: String(form.get("evogo_url") ?? "").trim(),
      evogo_api_key: String(form.get("evogo_api_key") ?? "").trim(),
      instance_name: String(form.get("instance_name") ?? "").trim(),
      active: form.get("active") === "on",
    };
    if (!payload.name || !payload.evogo_url || !payload.evogo_api_key || !payload.instance_name) {
      toast.error("Preencha todos os campos"); return;
    }
    const res = editingInst
      ? await supabase.from("instances").update(payload).eq("id", editingInst.id)
      : await supabase.from("instances").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success("Salvo"); setInstOpen(false); setEditingInst(null); qc.invalidateQueries({ queryKey: ["instances", unitId] }); }
  };

  const deleteInstance = async (id: string) => {
    if (!confirm("Excluir instância?")) return;
    const { error } = await supabase.from("instances").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["instances", unitId] });
  };

  const submitMessage = async (form: FormData) => {
    const payload = {
      unit_id: unitId,
      instance_id: msgInstance || (editingMsg?.instance_id ?? null),
      name: String(form.get("name") ?? "").trim(),
      trigger_type: msgTrigger as any,
      days_offset: parseInt(String(form.get("days_offset") ?? "0"), 10),
      send_time: String(form.get("send_time") ?? "09:00"),
      template: String(form.get("template") ?? "").trim(),
      active: form.get("active") === "on",
    };
    if (!payload.name || !payload.template) { toast.error("Nome e template obrigatórios"); return; }
    const res = editingMsg
      ? await supabase.from("messages").update(payload).eq("id", editingMsg.id)
      : await supabase.from("messages").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success("Salvo"); setMsgOpen(false); setEditingMsg(null); setMsgInstance(""); qc.invalidateQueries({ queryKey: ["messages", unitId] }); }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Excluir mensagem?")) return;
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", unitId] });
  };

  const openEditMessage = (m: any) => {
    setEditingMsg(m);
    setMsgInstance(m.instance_id ?? "");
    setMsgTrigger(m.trigger_type);
    setMsgOpen(true);
  };

  const instanceMap = Object.fromEntries(instances.map((i: any) => [i.id, i.name]));

  return (
    <AppLayout title={unit?.name ?? "Unidade"}>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild><Link to="/units"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link></Button>
      </div>

      <Tabs defaultValue="instances">
        <TabsList>
          <TabsTrigger value="instances"><Smartphone className="h-4 w-4 mr-1" />Instâncias</TabsTrigger>
          <TabsTrigger value="messages"><MessageSquareMore className="h-4 w-4 mr-1" />Mensagens</TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={instOpen} onOpenChange={(o) => { setInstOpen(o); if (!o) setEditingInst(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nova instância</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingInst ? "Editar" : "Nova"} instância Evogo</DialogTitle></DialogHeader>
                <form action={submitInstance} className="space-y-4">
                  <div className="space-y-2"><Label>Nome amigável</Label><Input name="name" required defaultValue={editingInst?.name} placeholder="Ex: WhatsApp Recepção" /></div>
                  <div className="space-y-2"><Label>URL do Evogo</Label><Input name="evogo_url" required defaultValue={editingInst?.evogo_url} placeholder="https://evogo.suaempresa.com" /></div>
                  <div className="space-y-2"><Label>API Key</Label><Input name="evogo_api_key" required defaultValue={editingInst?.evogo_api_key} /></div>
                  <div className="space-y-2"><Label>Nome da instância no Evogo</Label><Input name="instance_name" required defaultValue={editingInst?.instance_name} /></div>
                  <div className="flex items-center gap-2"><Switch name="active" defaultChecked={editingInst?.active ?? true} id="iact" /><Label htmlFor="iact">Ativa</Label></div>
                  <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="glass">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Instância Evogo</TableHead><TableHead>Status</TableHead><TableHead className="w-32 text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {instances.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma instância</TableCell></TableRow>
                  : instances.map((i: any) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-muted-foreground">{i.instance_name}</TableCell>
                      <TableCell><Badge variant={i.active ? "default" : "secondary"}>{i.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingInst(i); setInstOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteInstance(i.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={msgOpen} onOpenChange={(o) => { setMsgOpen(o); if (!o) { setEditingMsg(null); setMsgInstance(""); setMsgTrigger("appointment_reminder"); } }}>
              <DialogTrigger asChild><Button disabled={instances.length === 0}><Plus className="h-4 w-4 mr-1" />Nova mensagem</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editingMsg ? "Editar" : "Nova"} mensagem</DialogTitle></DialogHeader>
                <form action={submitMessage} className="space-y-4">
                  <div className="space-y-2"><Label>Nome</Label><Input name="name" required defaultValue={editingMsg?.name} placeholder="Ex: Lembrete 1 dia antes" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Tipo de gatilho</Label>
                      <Select value={msgTrigger} onValueChange={setMsgTrigger}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Instância de envio</Label>
                      <Select value={msgInstance} onValueChange={setMsgInstance}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{instances.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Dias de offset</Label><Input name="days_offset" type="number" defaultValue={editingMsg?.days_offset ?? -1} /><p className="text-xs text-muted-foreground">Negativo = antes; positivo = depois</p></div>
                    <div className="space-y-2"><Label>Horário de envio</Label><Input name="send_time" type="time" defaultValue={editingMsg?.send_time ?? "09:00"} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Textarea name="template" required rows={5} defaultValue={editingMsg?.template} placeholder="Olá {{cliente_nome}}, lembrando do seu agendamento em {{data}} às {{hora}}." />
                    <p className="text-xs text-muted-foreground">Variáveis: {`{{cliente_nome}}, {{data}}, {{hora}}, {{valor}}, {{unidade}}`}</p>
                  </div>
                  <div className="flex items-center gap-2"><Switch name="active" defaultChecked={editingMsg?.active ?? true} id="mact" /><Label htmlFor="mact">Ativa</Label></div>
                  <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {instances.length === 0 && <Card className="p-4 glass text-sm text-muted-foreground">Cadastre uma instância antes de criar mensagens.</Card>}
          <Card className="glass">
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Gatilho</TableHead><TableHead>Quando</TableHead><TableHead>Instância</TableHead><TableHead>Status</TableHead><TableHead className="w-32 text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>
                {messages.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma mensagem</TableCell></TableRow>
                  : messages.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{TRIGGER_LABELS[m.trigger_type]}</TableCell>
                      <TableCell className="text-muted-foreground">{m.days_offset === 0 ? "No dia" : `${m.days_offset > 0 ? "+" : ""}${m.days_offset}d`} às {m.send_time?.slice(0,5)}</TableCell>
                      <TableCell className="text-muted-foreground">{instanceMap[m.instance_id] ?? "—"}</TableCell>
                      <TableCell><Badge variant={m.active ? "default" : "secondary"}>{m.active ? "Ativa" : "Inativa"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEditMessage(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMessage(m.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
