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
import { Plus, Pencil, Trash2, Send, Clock, Check, ChevronsUpDown } from "lucide-react";
import { runCronJobNow } from "@/lib/evogo";

export const Route = createFileRoute("/automations")({ component: AutomationsPage });

type CronRow = Database["public"]["Tables"]["cron_jobs"]["Row"];
type CronWithRefs = CronRow & {
  messages: { id: string; name: string } | null;
};
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];

const DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatDays(days: number[]): string {
  if (days.length === 7) return "Todos os dias";
  const sorted = [...days].sort();
  if (sorted.join(",") === "1,2,3,4,5") return "Dias úteis";
  if (sorted.join(",") === "0,6") return "Fins de semana";
  return sorted.map((d) => DAY_LABELS[d]).join(" ");
}

function AutomationsPage() {
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
  const [cronDays, setCronDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [cronDaysQty, setCronDaysQty] = useState<number>(1);
  const [cronDaysDir, setCronDaysDir] = useState<"before" | "after" | "same">("before");
  const [cronStatus, setCronStatus] = useState("any");
  const [cronTipo, setCronTipo] = useState("any");
  const [cronAutoDispatch, setCronAutoDispatch] = useState(false);
  const [cronActive, setCronActive] = useState(true);
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
      setSelectedUnits([]);
      setInstanceMapping({});
      setCronName("");
      setCronTemplate("");
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
    if (selectedUnits.length === 0) {
      toast.error("Selecione pelo menos uma unidade");
      return;
    }
    for (const uId of selectedUnits) {
       if (!instanceMapping[uId]) {
          toast.error("Selecione uma instância para todas as unidades escolhidas");
          return;
       }
    }
    if (!cronTemplate) {
      toast.error("Selecione um template");
      return;
    }
    if (cronDays.length === 0) {
      toast.error("Selecione pelo menos um dia da semana");
      return;
    }
    setCronSubmitting(true);
    try {
      let resolvedCompanyId: string;
      if (editingCron) {
        resolvedCompanyId = editingCron.company_id;
      } else {
        const firstUnitId = selectedUnits[0];
        const { data: unitFull } = await supabase
          .from("units")
          .select("company_id")
          .eq("id", firstUnitId)
          .maybeSingle();
        if (!unitFull?.company_id) throw new Error("Não foi possível identificar a empresa da unidade selecionada");
        resolvedCompanyId = unitFull.company_id;
      }

      const offsetSigned =
        cronDaysDir === "same" ? 0 : cronDaysDir === "before" ? -cronDaysQty : cronDaysQty;

      const payload = {
        company_id: resolvedCompanyId,
        unit_ids: selectedUnits,
        instance_mapping: instanceMapping,
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
      qc.invalidateQueries({ queryKey: ["all-automations"] });
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
      qc.invalidateQueries({ queryKey: ["all-automations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover");
    }
  };

  const toggleCron = async (cron: CronWithRefs) => {
    try {
      const { error } = await supabase
        .from("cron_jobs")
        .update({ active: !cron.active })
        .eq("id", cron.id);
      if (error) throw new Error(error.message);
      qc.invalidateQueries({ queryKey: ["all-automations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    }
  };

  const runCronNow = async (cron: CronWithRefs) => {
    try {
      toast.info("Executando automação...");
      const res = await runCronJobNow({ data: { cronJobId: cron.id } });
      toast.success(
        `Automação executada: ${res.count} mensagens criadas${res.dispatched > 0 ? `, ${res.dispatched} enviadas` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["all-automations"] });
      qc.invalidateQueries({ queryKey: ["all-queue"] });
      if (res.dispatched > 0) qc.invalidateQueries({ queryKey: ["all-logs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao executar");
      qc.invalidateQueries({ queryKey: ["all-automations"] });
    }
  };

  return (
    <AppLayout title="Automações">
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted-foreground">
          Crons rodam a cada 5 min e disparam quando o horário cair na janela.
        </p>
        <Button onClick={() => openCronDialog()} disabled={units.length === 0}>
          <Plus className="h-4 w-4 mr-1" />
          Nova automação
        </Button>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / Template</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Auto-enviar</TableHead>
              <TableHead>Última execução</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8}>Carregando...</TableCell>
              </TableRow>
            ) : crons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma automação configurada
                </TableCell>
              </TableRow>
            ) : (
              crons.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.messages?.name ?? "Template removido"}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.unit_ids && c.unit_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.unit_ids.map((id) => {
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

      <Dialog open={cronOpen} onOpenChange={setCronOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {editingCron ? "Editar automação" : "Nova automação"}
            </DialogTitle>
            <DialogDescription>
              Roda no horário e dias selecionados. Busca agendamentos do Belle pra "X dias
              antes/depois" da data atual e gera mensagens na fila.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCron} className="space-y-4">
            {!editingCron && (
              <div className="space-y-4">
                <div className="space-y-2 flex flex-col">
                  <Label>Unidades Participantes</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedUnits.length === 0 
                          ? "Selecione as unidades..." 
                          : `${selectedUnits.length} unidade(s) selecionada(s)`}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar unidade..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                if (selectedUnits.length === units.length) {
                                  setSelectedUnits([]);
                                  setInstanceMapping({});
                                } else {
                                  setSelectedUnits(units.map((u) => u.id));
                                }
                              }}
                            >
                              <div
                                className={cn(
                                  "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                  selectedUnits.length === units.length
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible"
                                )}
                              >
                                <Check className={cn("h-4 w-4")} />
                              </div>
                              <span>Selecionar Todas</span>
                            </CommandItem>
                            {units.map((u) => (
                              <CommandItem
                                key={u.id}
                                value={u.name}
                                onSelect={() => {
                                  if (selectedUnits.includes(u.id)) {
                                    setSelectedUnits((prev) => prev.filter((id) => id !== u.id));
                                    setInstanceMapping((prev) => {
                                      const copy = { ...prev };
                                      delete copy[u.id];
                                      return copy;
                                    });
                                  } else {
                                    setSelectedUnits((prev) => [...prev, u.id]);
                                  }
                                }}
                              >
                                <div
                                  className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                    selectedUnits.includes(u.id)
                                      ? "bg-primary text-primary-foreground"
                                      : "opacity-50 [&_svg]:invisible"
                                  )}
                                >
                                  <Check className={cn("h-4 w-4")} />
                                </div>
                                <span>{u.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {selectedUnits.length > 0 && (
                  <div className="space-y-2">
                    <Label>Instâncias de Envio</Label>
                    <ScrollArea className="h-48 pr-4">
                      <div className="space-y-3">
                        {selectedUnits.map(uId => {
                           const u = units.find(x => x.id === uId);
                           const uInstances = instances.filter(i => i.unit_id === uId);
                           return (
                             <div key={uId} className="flex items-center justify-between gap-4 p-2 border rounded-md">
                               <span className="text-sm font-medium truncate w-1/3">{u?.name}</span>
                               <div className="flex-1">
                                 <Select
                                   value={instanceMapping[uId] || ""}
                                   onValueChange={(v) => setInstanceMapping(prev => ({...prev, [uId]: v}))}
                                 >
                                   <SelectTrigger>
                                     <SelectValue placeholder="Selecione o WhatsApp" />
                                   </SelectTrigger>
                                   <SelectContent>
                                     {uInstances.length > 0 ? (
                                        uInstances.map(i => (
                                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                        ))
                                     ) : (
                                        <SelectItem value="none" disabled>Nenhuma instância conectada</SelectItem>
                                     )}
                                   </SelectContent>
                                 </Select>
                               </div>
                             </div>
                           )
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
            
            {editingCron && (
              <div className="space-y-2">
                <Label>Unidades e Instâncias Configuradas</Label>
                <ScrollArea className="h-48 pr-4">
                  <div className="space-y-2">
                    {selectedUnits.map(uId => {
                      const u = units.find(x => x.id === uId);
                      const instId = instanceMapping[uId];
                      const inst = instances.find(x => x.id === instId);
                      return (
                        <div key={uId} className="flex justify-between items-center p-2 border rounded text-sm bg-muted text-muted-foreground">
                          <span className="truncate">{u?.name}</span>
                          <Badge variant="outline" className="bg-background">
                             {inst?.name || "Desconhecida"}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cronName">Nome (opcional)</Label>
                <Input
                  id="cronName"
                  value={cronName}
                  onChange={(e) => setCronName(e.target.value)}
                  placeholder="Ex: Lembrete diário"
                />
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={cronTemplate} onValueChange={setCronTemplate}>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2">
                <Label htmlFor="cronTime">Horário (Brasil)</Label>
                <Input
                  id="cronTime"
                  type="time"
                  value={cronTime}
                  onChange={(e) => setCronTime(e.target.value)}
                />
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
    </AppLayout>
  );
}
