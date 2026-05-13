"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
import { Clock, Plus, Pencil, Trash2, Send, Check, ChevronsUpDown, Calendar, DollarSign, Smartphone } from "lucide-react";
import { runCronJobNow } from "@/lib/evogo";

type CronRow = Database["public"]["Tables"]["cron_jobs"]["Row"];
type CronWithRefs = CronRow & {
  messages: { id: string; name: string } | null;
};
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];

export default function AutomationsPage() {
  const qc = useQueryClient();

  const { data: units = [] } = useQuery({
    queryKey: ["units-list"],
    queryFn: async () => {
      const { data } = await supabase.from("units").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: crons = [], isLoading } = useQuery<CronWithRefs[]>({
    queryKey: ["all-automations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cron_jobs")
        .select("*, messages(id, name)")
        .order("schedule_time");
      if (error) throw error;
      return (data ?? []) as CronWithRefs[];
    },
  });

  const { data: messages = [] } = useQuery<MessageRow[]>({
    queryKey: ["all-messages-for-cron"],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").order("name");
      return (data ?? []) as MessageRow[];
    },
  });

  const { data: instances = [] } = useQuery<InstanceRow[]>({
    queryKey: ["all-instances-for-cron"],
    queryFn: async () => {
      const { data } = await supabase.from("instances").select("*").order("name");
      return (data ?? []) as InstanceRow[];
    },
  });

  const [cronOpen, setCronOpen] = useState(false);
  const [editingCron, setEditingCron] = useState<CronWithRefs | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [instanceMapping, setInstanceMapping] = useState<Record<string, string>>({});
  const [cronName, setCronName] = useState("");
  const [cronTemplate, setCronTemplate] = useState("");
  const [cronTime, setCronTime] = useState("09:00");
  const [cronDaysQty, setCronDaysQty] = useState<number>(1);
  const [cronDaysDir, setCronDaysDir] = useState<"before" | "after" | "same">("before");
  const [cronSource, setCronSource] = useState<string>("appointment");
  const [cronStatus, setCronStatus] = useState<string>("any");
  const [cronTipo, setCronTipo] = useState<string>("any");
  const [cronActive, setCronActive] = useState(true);
  const [cronInterval, setCronInterval] = useState<number>(30);
  const [cronSubmitting, setCronSubmitting] = useState(false);

  const availableMessages = messages.filter(
    (m) => m.unit_ids.length === 0 || selectedUnits.some(uId => m.unit_ids.includes(uId))
  );

  const openCronDialog = (existing: CronWithRefs | null = null) => {
    setEditingCron(existing);
    if (existing) {
      setSelectedUnits(existing.unit_ids || []);
      setInstanceMapping((existing.instance_mapping as Record<string, string>) || {});
      setCronName(existing.name ?? "");
      setCronTemplate(existing.message_id);
      setCronTime(existing.schedule_time);
      setCronDaysQty(Math.abs(existing.days_offset));
      setCronDaysDir(existing.days_offset === 0 ? "same" : existing.days_offset > 0 ? "before" : "after");
      setCronSource((existing as any).trigger_source || "appointment");
      setCronStatus((existing as any).status_filter || "any");
      setCronTipo((existing as any).tipo_filter || "any");
      setCronActive(existing.active);
      setCronInterval((existing as any).interval_seconds ?? 30);
    } else {
      setSelectedUnits([]);
      setInstanceMapping({});
      setCronName("");
      setCronTemplate("");
      setCronTime("09:00");
      setCronDaysQty(1);
      setCronDaysDir("before");
      setCronSource("appointment");
      setCronStatus("any");
      setCronTipo("any");
      setCronActive(true);
      setCronInterval(30);
    }
    setCronOpen(true);
  };

  const submitCron = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUnits.length === 0) {
      toast.error("Selecione pelo menos uma unidade");
      return;
    }
    for (const uId of selectedUnits) {
      if (!instanceMapping[uId]) {
        const unit = units.find(u => u.id === uId);
        toast.error(`Selecione uma instância para a unidade: ${unit?.name}`);
        return;
      }
    }
    if (!cronTemplate) {
      toast.error("Selecione um template");
      return;
    }
    setCronSubmitting(true);
    try {
      let resolvedCompanyId: string;
      if (editingCron) {
        resolvedCompanyId = editingCron.company_id;
      } else {
        const firstUnitId = selectedUnits[0];
        const { data: unitFull } = await supabase.from("units").select("company_id").eq("id", firstUnitId).maybeSingle();
        resolvedCompanyId = unitFull?.company_id || "";
      }

      const offsetSigned = cronDaysDir === "same" ? 0 : cronDaysDir === "before" ? cronDaysQty : -cronDaysQty;

      const payload = {
        company_id: resolvedCompanyId,
        unit_ids: selectedUnits,
        instance_mapping: instanceMapping,
        message_id: cronTemplate,
        name: cronName.trim() || null,
        schedule_time: cronTime,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        days_offset: offsetSigned,
        trigger_source: cronSource,
        status_filter: cronStatus === "any" ? null : cronStatus,
        tipo_filter: cronTipo === "any" ? null : cronTipo,
        active: cronActive,
        interval_seconds: cronInterval,
      };

      const res = editingCron
        ? await supabase.from("cron_jobs").update(payload as any).eq("id", editingCron.id)
        : await supabase.from("cron_jobs").insert(payload as any);

      if (res.error) throw new Error(res.error.message);
      toast.success("Salvo com sucesso");
      setCronOpen(false);
      qc.invalidateQueries({ queryKey: ["all-automations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setCronSubmitting(false);
    }
  };

  const deleteCron = async (id: string) => {
    const { error } = await supabase.from("cron_jobs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["all-automations"] });
  };

  const runCronNow = async (cron: CronWithRefs) => {
    try {
      toast.info("Processando automação...");
      const res = await runCronJobNow({ data: { cronJobId: cron.id } });
      toast.success(`${res.count} mensagens adicionadas à fila`);
      qc.invalidateQueries({ queryKey: ["all-automations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar");
    }
  };

  return (
    <AppLayout title="Automações">
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted-foreground">Configure disparos automáticos baseados no Belle.</p>
        <Button onClick={() => openCronDialog()}>
          <Plus className="h-4 w-4 mr-1" /> Nova automação
        </Button>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6">Nome / Origem</TableHead>
              <TableHead>Unidades</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Janela</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right px-6">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell></TableRow>
            ) : crons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <Clock className="h-12 w-12" />
                    <p>Nenhuma automação cadastrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              crons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="px-6">
                    <div className="font-medium">{c.name || "Sem nome"}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-[10px] h-4 font-bold uppercase tracking-tighter border-primary/20 text-primary/80">
                        {c.messages?.name || "Template removido"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-4 font-bold uppercase tracking-tighter">
                        {(c as any).trigger_source === 'billing' ? 'Cobrança' : 'Agendamento'}
                      </Badge>
                      {(c as any).status_filter && (
                        <Badge variant="outline" className="text-[10px] h-4 font-bold uppercase tracking-tighter border-emerald-500/20 text-emerald-500/80 bg-emerald-500/5">
                          {(c as any).status_filter}
                        </Badge>
                      )}
                      {(c as any).tipo_filter && (c as any).tipo_filter !== 'any' && (
                        <Badge variant="outline" className="text-[10px] h-4 font-bold uppercase tracking-tighter border-blue-500/20 text-blue-500/80 bg-blue-500/5">
                          {(c as any).tipo_filter}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(c.unit_ids || [])
                        .map((id) => units.find((u) => u.id === id))
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((u) => (
                          <Badge key={u!.id} variant="outline" className="text-[10px] bg-muted/50">
                            {u!.name}
                          </Badge>
                        ))}
                      {c.unit_ids && c.unit_ids.filter(id => units.find(u => u.id === id)).length > 2 && (
                        <Badge variant="outline" className="text-[10px]">+{c.unit_ids.filter(id => units.find(u => u.id === id)).length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.schedule_time}</TableCell>
                  <TableCell className="text-xs">
                    {c.days_offset === 0 ? "No dia" : c.days_offset < 0 ? `${Math.abs(c.days_offset)} dia(s) antes` : `${c.days_offset} dia(s) depois`}
                  </TableCell>
                  <TableCell>
                    {c.last_run_at ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <div className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            c.last_run_status === 'success' ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" : "bg-destructive shadow-[0_0_5px_rgba(239,68,68,0.5)]"
                          )} />
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-tight",
                            c.last_run_status === 'success' ? "text-emerald-500" : "text-destructive"
                          )}>
                            {c.last_run_status === 'success' ? 'Sucesso' : 'Falha'}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(c.last_run_at).toLocaleString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        {c.last_run_error && (
                           <span className="text-[9px] text-destructive/70 leading-tight max-w-[120px] truncate" title={c.last_run_error}>
                             {c.last_run_error}
                           </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Nunca executado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={c.active} onCheckedChange={async (v) => {
                      await supabase.from("cron_jobs").update({ active: v }).eq("id", c.id);
                      qc.invalidateQueries({ queryKey: ["all-automations"] });
                    }} />
                  </TableCell>
                  <TableCell className="text-right px-6">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => runCronNow(c)} title="Rodar agora"><Send className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCronDialog(c)}><Pencil className="h-4 w-4" /></Button>
                      <ConfirmDialog trigger={<Button size="icon" variant="ghost" className="h-8 w-8 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>} title="Excluir automação?" onConfirm={() => deleteCron(c.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={cronOpen} onOpenChange={setCronOpen}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> {editingCron ? "Editar" : "Nova"} automação
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submitCron} className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Automação</Label>
                  <Input value={cronName} onChange={e => setCronName(e.target.value)} placeholder="Ex: Lembrete de Agendamento" />
                </div>
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
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Selecione as Unidades Alvo</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">{selectedUnits.length > 0 ? `${selectedUnits.length} unidade(s) selecionada(s)` : "Selecionar Unidades"}<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" /></Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar unidade..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
                          <CommandGroup>
                            {units.map(u => (
                              <CommandItem key={u.id} onSelect={() => setSelectedUnits(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}>
                                <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedUnits.includes(u.id) ? "bg-primary text-primary-foreground" : "opacity-50")}>
                                  {selectedUnits.includes(u.id) && <Check className="h-4 w-4" />}
                                </div>
                                {u.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {selectedUnits.length > 0 && (
                  <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground tracking-widest bg-muted/50 px-4 py-2 border-b border-border/50">
                      <Smartphone className="h-3 w-3" /> Configurar WhatsApp por Unidade
                    </div>
                    <ScrollArea className={cn("w-full", selectedUnits.length > 3 ? "h-[200px]" : "h-auto")}>
                      <div className="p-4 grid grid-cols-1 gap-2">
                        {selectedUnits.map(uId => {
                          const unit = units.find(u => u.id === uId);
                          const unitInstances = instances.filter(i => i.unit_id === uId);
                          return (
                            <div key={uId} className="flex items-center justify-between gap-4 bg-background/50 p-2.5 rounded-lg border border-border/50 hover:border-primary/20 transition-colors">
                              <span className="text-sm font-medium truncate flex-1">{unit?.name}</span>
                              <Select value={instanceMapping[uId] || ""} onValueChange={v => setInstanceMapping(prev => ({ ...prev, [uId]: v }))}>
                                <SelectTrigger className="w-[220px] h-9 text-xs bg-background">
                                  <SelectValue placeholder="Escolher WhatsApp" />
                                </SelectTrigger>
                                <SelectContent>
                                  {unitInstances.length === 0 ? (
                                    <SelectItem value="no-inst" disabled>Nenhuma instância conectada</SelectItem>
                                  ) : (
                                    unitInstances.map(inst => (
                                      <SelectItem key={inst.id} value={inst.id}>
                                        <div className="flex items-center gap-2">
                                          <div className={cn("h-2 w-2 rounded-full", inst.status === 'connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-muted")} />
                                          {inst.name}
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Template de Mensagem</Label>
                  <Select value={cronTemplate} onValueChange={setCronTemplate}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {availableMessages.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Horário de Execução</Label>
                  <Input type="time" value={cronTime} onChange={e => setCronTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo entre mensagens (seg)</Label>
                  <Input type="number" value={cronInterval} onChange={e => setCronInterval(parseInt(e.target.value))} min={5} />
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

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-primary/70">Janela de Disparo (Data Alvo)</Label>
                  <Badge variant="outline" className="text-[10px] border-primary/20 bg-primary/10 text-primary">Configuração de D+X</Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                     <Label className="text-xs">Qtd:</Label>
                     <Input type="number" className="w-16 h-9" value={cronDaysQty} onChange={e => setCronDaysQty(parseInt(e.target.value))} min={0} />
                  </div>
                  <Select value={cronDaysDir} onValueChange={(v: any) => setCronDaysDir(v)}>
                    <SelectTrigger className="flex-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Dia(s) antes da data</SelectItem>
                      <SelectItem value="same">No mesmo dia da data</SelectItem>
                      <SelectItem value="after">Dia(s) depois da data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pb-6">
                <Button type="submit" disabled={cronSubmitting} className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20">
                  {cronSubmitting ? "Salvando..." : editingCron ? "Atualizar Automação" : "Criar Automação"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
