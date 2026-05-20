"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Plus, Megaphone, Play, Pause, Trash2, Loader2, Info, 
  Settings2, Users, Upload, FileSpreadsheet, Globe, 
  CheckCircle2, AlertCircle, Eye, BarChart3, Search, 
  XCircle, Clock, ChevronRight, Activity, Pencil, MessageSquare, History, X, UserPlus, Send, ExternalLink, Smartphone, Globe2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/auth-context";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { triggerCampaignWorker, startCampaignServer, pauseCampaignServer, resumeCampaignServer } from "./actions";

type CampaignRow = any; // Facilitando para evitar erros de tipagem rápida

const STATUS_MAP: Record<string, { label: string; variant: "default" | "outline" | "secondary" | "destructive", icon: any, color: string }> = {
  draft: { label: "Rascunho", variant: "outline", icon: Clock, color: "text-amber-500 border-amber-500/50" },
  running: { label: "Rodando", variant: "secondary", icon: Activity, color: "text-primary border-primary/50 bg-primary/10" },
  completed: { label: "Concluída", variant: "secondary", icon: CheckCircle2, color: "text-emerald-500 border-emerald-500/50 bg-emerald-500/10" },
  paused: { label: "Pausada", variant: "outline", icon: Pause, color: "text-amber-500 border-amber-500/50" },
  canceled: { label: "Cancelada", variant: "destructive", icon: XCircle, color: "text-destructive border-destructive/50" },
};

export default function CampaignsPage() {
  const qc = useQueryClient();
  const { companyId } = useAuth();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [interval, setInterval] = useState("30");
  const [contacts, setContacts] = useState<{ name: string; number: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          *,
          template:messages(name, template),
          instance:instances(name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000, // Atualiza a cada 5 segundos para mostrar o progresso
  });

  const { data: detailedContacts = [] } = useQuery({
    queryKey: ["campaign-contacts", selectedCampaign?.id],
    queryFn: async () => {
      if (!selectedCampaign?.id) return [];
      const { data, error } = await supabase
        .from("campaign_contacts")
        .select("*")
        .eq("campaign_id", selectedCampaign.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCampaign?.id && isDetailsOpen,
    refetchInterval: isDetailsOpen ? 3000 : false,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["messages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("id, name");
      return data ?? [];
    },
  });

  const { data: instances = [] } = useQuery({
    queryKey: ["instances-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("instances")
        .select(`
          id, 
          name, 
          status, 
          unit_id,
          company_id,
          units(name)
        `);
      return data ?? [];
    },
  });

  const resetForm = () => {
    setName("");
    setTemplateId("");
    setInstanceId("");
    setInterval("30");
    setContacts([]);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startCampaign = async (c: any) => {
    if (!c) return;
    setLoading(true);
    try {
      // 1. Verificar se a instância está conectada
      const { data: inst } = await supabase.from("instances").select("status, name").eq("id", c.instance_id).single();
      console.log(`[campaign] Verificando conexão da instância "${inst?.name}": ${inst?.status}`);
      
      const isConnected = inst?.status === 'connected' || (inst?.status as string) === 'open';
      
      if (!isConnected) {
        toast.error(`A instância "${inst?.name || 'selecionada'}" não está conectada (Status: ${inst?.status || 'desconhecido'}).`);
        setLoading(false);
        return;
      }

      // 2. Chamar o servidor para enfileirar e iniciar
      const result = await startCampaignServer(c.id);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(`${result.count} mensagens enfileiradas com sucesso!`);
      
      setIsDetailsOpen(false);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar campanha");
    } finally {
      setLoading(false);
    }
  };

  const pauseCampaign = async (id: string) => {
    setLoading(true);
    try {
      const result = await pauseCampaignServer(id);
      if (!result.success) throw new Error(result.error);
      toast.success("Campanha pausada");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao pausar");
    } finally {
      setLoading(false);
    }
  };

  const resumeCampaign = async (id: string) => {
    setLoading(true);
    try {
      const result = await resumeCampaignServer(id);
      if (!result.success) throw new Error(result.error);
      toast.success("Campanha retomada");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao retomar");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = async (c: any) => {
    setName(c.name);
    setTemplateId(c.message_id);
    setInstanceId(c.instance_id);
    setInterval(String(c.interval_seconds || 30));
    setEditingId(c.id);
    setIsNewOpen(true);

    // Carregar contatos para o editor
    const { data: contactsData } = await supabase
      .from("campaign_contacts")
      .select("name, number")
      .eq("campaign_id", c.id);
    
    if (contactsData) {
      setContacts(contactsData.map(con => ({ name: con.name || "", number: con.number })));
    }
  };

  const deleteCampaign = async (id: string) => {
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Campanha excluída");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'csv') {
      Papa.parse(file, {
        complete: (results) => {
          let rows = (results.data as any[][]).filter((row: any) => row.length > 0);
          
          // Detecção de cabeçalho
          if (rows.length > 0) {
            const firstRow = rows[0].join(',').toLowerCase();
            const hasHeaderWords = firstRow.includes('nome') || firstRow.includes('numero') || firstRow.includes('celular') || firstRow.includes('contato') || firstRow.includes('phone');
            // Se a primeira linha tem palavras de cabeçalho e a segunda coluna não parece um número (menos de 8 dígitos)
            const secondCol = String(rows[0][1] || '').replace(/\D/g, '');
            const firstCol = String(rows[0][0] || '').replace(/\D/g, '');
            
            if (hasHeaderWords || (secondCol.length < 8 && firstCol.length < 8)) {
              rows = rows.slice(1);
            }
          }

          const newContacts = rows.map((row: any) => ({
            name: String(row[0] || '').trim(),
            number: String(row[1] || row[0] || '').replace(/\D/g, '')
          })).filter(c => c.number);

          setContacts(prev => [...prev, ...newContacts]);
          toast.success(`${newContacts.length} contatos importados do CSV`);
        },
        header: false,
        skipEmptyLines: true
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          let data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          data = data.filter(row => row.length > 0);

          // Detecção de cabeçalho
          if (data.length > 0) {
            const firstRow = data[0].join(',').toLowerCase();
            const hasHeaderWords = firstRow.includes('nome') || firstRow.includes('numero') || firstRow.includes('celular') || firstRow.includes('contato') || firstRow.includes('phone');
            const secondCol = String(data[0][1] || '').replace(/\D/g, '');
            const firstCol = String(data[0][0] || '').replace(/\D/g, '');

            if (hasHeaderWords || (secondCol.length < 8 && firstCol.length < 8)) {
              data = data.slice(1);
            }
          }

          const newContacts = data.map(row => ({
            name: String(row[0] || '').trim(),
            number: String(row[1] || row[0] || '').replace(/\D/g, '')
          })).filter(c => c.number);

          setContacts(prev => [...prev, ...newContacts]);
          toast.success(`${newContacts.length} contatos importados do Excel`);
        } catch (err) {
          toast.error("Erro ao ler arquivo Excel");
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error("Formato não suportado. Use CSV ou Excel.");
    }
    // Limpa o input para permitir subir o mesmo arquivo de novo se necessário
    e.target.value = "";
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !templateId || !instanceId) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase.from("campaigns").update({
          name,
          message_id: templateId,
          instance_id: instanceId,
          interval_seconds: parseInt(interval, 10) || 30,
        }).eq("id", editingId);

        if (error) throw error;
        toast.success("Campanha atualizada!");
      } else {
        const selectedInst = (instances as any[]).find(i => i.id === instanceId);
        const resolvedCompanyId = companyId || selectedInst?.company_id;

        if (!resolvedCompanyId) {
          toast.error("Não foi possível identificar sua empresa.");
          setLoading(false);
          return;
        }

        const { data: campaign, error } = await supabase.from("campaigns").insert({
          company_id: resolvedCompanyId,
          name,
          message_id: templateId,
          instance_id: instanceId,
          status: "draft",
          interval_seconds: parseInt(interval, 10) || 30,
        }).select().single();

        if (error) throw error;

        if (contacts.length > 0) {
          const contactInserts = contacts.map(c => ({
            campaign_id: campaign.id,
            number: c.number,
            name: c.name || null,
          }));
          
          await supabase.from("campaign_contacts").insert(contactInserts);
          await supabase.from("campaigns").update({ total_contacts: contactInserts.length }).eq("id", campaign.id);
        }
        toast.success("Campanha criada com sucesso!");
      }

      setIsNewOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar campanha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Campanhas">
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Campanhas</h2>
          <p className="text-muted-foreground">Envio em massa para listas de contatos.</p>
        </div>
        <Button onClick={() => { resetForm(); setIsNewOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Campanha
        </Button>
      </div>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-4">Campanha</TableHead>
              <TableHead>Template / Instância</TableHead>
              <TableHead>Progresso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right px-6">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span>Carregando campanhas...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <Megaphone className="h-12 w-12" />
                    <p>Nenhuma campanha cadastrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c: any) => {
                const status = STATUS_MAP[c.status] || STATUS_MAP.draft;
                const StatusIcon = status.icon;
                const total = c.total_contacts || 0;
                const processed = (c.sent_count || 0) + (c.failed_count || 0);
                const progress = total > 0 ? (processed / total) * 100 : 0;

                return (
                  <TableRow key={c.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="px-6">
                      <div className="flex flex-col">
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy HH:mm")}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="h-3 w-3 text-primary/60" />
                          <span>{c.template?.name || "Livre"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>{c.instance?.name || "Não definida"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[200px]">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px]">
                          <span className="font-medium">{processed}/{total} processados</span>
                          <span className="text-muted-foreground">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1.5 py-1 px-2.5 font-bold border", status.color)}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="uppercase tracking-tight">{status.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right px-6 min-w-[160px]">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" 
                          title="Ver detalhes e progresso"
                          onClick={() => { setSelectedCampaign(c); setIsDetailsOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {c.status === 'draft' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10" 
                            title="Iniciar agora"
                            onClick={() => startCampaign(c)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {c.status === 'running' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-amber-500 hover:text-amber-500 hover:bg-amber-500/10" 
                            title="Pausar"
                            onClick={() => pauseCampaign(c.id)}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {c.status === 'paused' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10" 
                            title="Retomar"
                            onClick={() => resumeCampaign(c.id)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground" 
                          title="Editar"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Excluir campanha?"
                          description="Isso excluirá permanentemente a campanha e todo o seu histórico de envios."
                          onConfirm={() => deleteCampaign(c.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Altere as configurações da campanha selecionada." : "Crie uma nova campanha de disparos em massa."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha</Label>
              <Input id="name" placeholder="Ex: Black Friday 2024" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{messages.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Instância</Label>
                <Select value={instanceId} onValueChange={setInstanceId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione uma instância..." />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            i.status === "connected" ? "bg-emerald-500" : "bg-muted-foreground/30"
                          )} />
                          <div className="flex flex-col items-start leading-tight">
                            <span className="font-medium">{i.name}</span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {i.units?.name ? (
                                <>
                                  <Smartphone className="h-2 w-2" />
                                  {i.units.name}
                                </>
                              ) : (
                                <>
                                  <Globe2 className="h-2 w-2" />
                                  Geral
                                </>
                              )}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Intervalo entre mensagens (segundos)</Label>
              <Input type="number" min="5" value={interval} onChange={(e) => setInterval(e.target.value)} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Lista de Contatos ({contacts.length})</Label>
                <div className="flex gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".csv,.xlsx,.xls" 
                    onChange={handleFileUpload} 
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs gap-1"
                    onClick={() => setContacts(prev => [...prev, { name: "", number: "" }])}
                  >
                    <Plus className="h-3 w-3" /> Adicionar Linha
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs gap-1 bg-primary/5 border-primary/20 hover:bg-primary/10"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" /> Importar Arquivo
                  </Button>
                </div>
              </div>
              
              <Card className="border border-muted-foreground/10 bg-muted/5">
                <div className="max-h-[250px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-muted/30 sticky top-0 z-10">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 px-3 text-xs">Nome</TableHead>
                        <TableHead className="h-9 py-2 px-3 text-xs">Número</TableHead>
                        <TableHead className="h-9 py-2 px-3 text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs italic">
                            Nenhum contato adicionado. Importe uma planilha ou adicione manualmente.
                          </TableCell>
                        </TableRow>
                      ) : (
                        contacts.map((contact, idx) => (
                          <TableRow key={idx} className="group hover:bg-muted/20 border-b border-muted-foreground/5">
                            <TableCell className="p-1 px-2">
                              <Input 
                                className="h-8 text-xs border-none bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 transition-colors" 
                                value={contact.name} 
                                placeholder="Nome..."
                                onChange={(e) => {
                                  const newC = [...contacts];
                                  newC[idx].name = e.target.value;
                                  setContacts(newC);
                                }}
                              />
                            </TableCell>
                            <TableCell className="p-1 px-2">
                              <Input 
                                className="h-8 text-xs border-none bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 transition-colors font-mono" 
                                value={contact.number} 
                                placeholder="Número..."
                                onChange={(e) => {
                                  const newC = [...contacts];
                                  newC[idx].number = e.target.value.replace(/\D/g, "");
                                  setContacts(newC);
                                }}
                              />
                            </TableCell>
                            <TableCell className="p-1 px-2 text-right">
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Salvando..." : editingId ? "Atualizar Campanha" : "Criar Campanha"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detalhes da Campanha */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0 gap-0 border-none glass-dark">
          <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5 pr-12">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Megaphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">{selectedCampaign?.name}</DialogTitle>
                  <DialogDescription>ID: {selectedCampaign?.id?.split('-')[0]}</DialogDescription>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedCampaign?.status === 'draft' && (
                <Button 
                  disabled={loading}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-lg shadow-emerald-600/20" 
                  onClick={() => startCampaign(selectedCampaign)}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Iniciar Campanha
                </Button>
              )}
              {selectedCampaign?.status === 'running' && (
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/20 text-primary border-primary/30 animate-pulse py-1.5 px-3">
                    <Activity className="h-3 w-3 mr-1.5" /> Rodando Agora
                  </Badge>
                  <Button 
                    variant="outline"
                    className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                    onClick={() => pauseCampaign(selectedCampaign.id)}
                  >
                    <Pause className="h-4 w-4" /> Pausar
                  </Button>
                </div>
              )}
              {selectedCampaign?.status === 'paused' && (
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 py-1.5 px-3">
                    <Pause className="h-3 w-3 mr-1.5" /> Pausada
                  </Badge>
                  <Button 
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => resumeCampaign(selectedCampaign.id)}
                  >
                    <Play className="h-4 w-4" /> Retomar
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total de Contatos</span>
                <p className="text-3xl font-bold">{selectedCampaign?.total_contacts || 0}</p>
              </div>
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/10 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500/70">Aguardando</span>
                <p className="text-3xl font-bold text-amber-500">
                  {(selectedCampaign?.total_contacts || 0) - (selectedCampaign?.sent_count || 0) - (selectedCampaign?.failed_count || 0)}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/10 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/70">Mensagens Enviadas</span>
                <p className="text-3xl font-bold text-emerald-500">{selectedCampaign?.sent_count || 0}</p>
              </div>
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/10 space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-destructive/70">Falhas / Erros</span>
                <p className="text-3xl font-bold text-destructive">{selectedCampaign?.failed_count || 0}</p>
              </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="bg-white/5 p-1 border border-white/5">
                <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-white">Visão Geral</TabsTrigger>
                <TabsTrigger value="contacts" className="data-[state=active]:bg-primary data-[state=active]:text-white">Lista de Contatos</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <Label className="text-sm font-medium">Progresso da Campanha</Label>
                    <span className="text-2xl font-bold text-primary">
                      {selectedCampaign?.total_contacts > 0 
                        ? Math.round(((selectedCampaign.sent_count + (selectedCampaign.failed_count || 0)) / selectedCampaign.total_contacts) * 100) 
                        : 0}%
                    </span>
                  </div>
                  <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                    <Progress 
                      value={selectedCampaign?.total_contacts > 0 ? ((selectedCampaign.sent_count + (selectedCampaign.failed_count || 0)) / selectedCampaign.total_contacts) * 100 : 0} 
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4 p-5 rounded-2xl bg-white/5 border border-white/5">
                    <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-muted-foreground">
                      <Settings2 className="h-4 w-4" /> Detalhes Técnicos
                    </h4>
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between items-center border-b border-white/5 pb-3">
                        <span className="text-sm text-muted-foreground">Instância Ativa</span>
                        <Badge variant="outline" className="font-mono text-primary border-primary/20">{selectedCampaign?.instance?.name}</Badge>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-3">
                        <span className="text-sm text-muted-foreground">Template Utilizado</span>
                        <span className="text-sm font-medium">{selectedCampaign?.template?.name}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-3">
                        <span className="text-sm text-muted-foreground">Intervalo de Disparo</span>
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <Clock className="h-3 w-3 text-primary" />
                          {selectedCampaign?.interval_seconds} segundos
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Status Atual</span>
                        <Badge variant="outline" className={cn("gap-1.5", STATUS_MAP[selectedCampaign?.status]?.color)}>
                          {STATUS_MAP[selectedCampaign?.status]?.label}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-5 rounded-2xl bg-white/5 border border-white/5">
                    <h4 className="text-sm font-bold flex items-center gap-2 uppercase tracking-tight text-muted-foreground">
                      <MessageSquare className="h-4 w-4" /> Conteúdo da Mensagem
                    </h4>
                    <div className="p-4 rounded-xl bg-black/20 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed border border-white/5 h-[300px] overflow-y-auto custom-scrollbar">
                      {selectedCampaign?.template?.template || "Nenhum conteúdo definido."}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contacts" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="rounded-2xl border border-white/5 overflow-hidden max-h-[450px] overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-black/40 backdrop-blur-md sticky top-0 z-10">
                      <TableRow>
                        <TableHead>Nome do Cliente</TableHead>
                        <TableHead>Telefone / WhatsApp</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailedContacts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-20 text-muted-foreground">
                            <div className="flex flex-col items-center gap-2 opacity-30">
                              <Users className="h-10 w-10" />
                              <p>Nenhum contato encontrado nesta campanha.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailedContacts.map((contact: any) => (
                          <TableRow key={contact.id} className="hover:bg-white/5 transition-colors">
                            <TableCell className="font-medium">{contact.name || "Sem nome"}</TableCell>
                            <TableCell className="text-muted-foreground font-mono">{contact.number}</TableCell>
                            <TableCell>
                              {contact.status === 'sent' && (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Enviado
                                </Badge>
                              )}
                              {contact.status === 'failed' && (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 gap-1 w-fit">
                                    <XCircle className="h-3 w-3" /> Falha
                                  </Badge>
                                  {contact.error && (
                                    <span className="text-[10px] text-destructive/70 max-w-[200px] truncate" title={contact.error}>
                                      {contact.error}
                                    </span>
                                  )}
                                </div>
                              )}
                              {contact.status === 'pending' && (
                                <Badge variant="outline" className="text-muted-foreground gap-1">
                                  <Clock className="h-3 w-3" /> Aguardando
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
