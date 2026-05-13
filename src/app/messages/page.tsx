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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
import { sendEvogoMessage } from "@/lib/evogo";
import { useAuth } from "@/lib/auth-context";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  FileText, 
  Image as ImageIcon, 
  ListFilter, 
  Plus,
  Pencil,
  Trash2,
  Send,
  Check,
  ChevronsUpDown,
  Upload,
  Loader2,
  Video,
  Music,
  File as FileIcon,
  MessageSquare
} from "lucide-react";
import { VARIABLES } from "@/lib/constants";
import { MessagePreview } from "@/components/message-preview";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type InstanceRow = Database["public"]["Tables"]["instances"]["Row"];
type InstanceWithUnit = InstanceRow & {
  units: { id: string; name: string } | null;
};

// Removido ContentPreview local em favor do MessagePreview compartilhado

export default function MessagesPage() {
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

  const [msgOpen, setMsgOpen] = useState(false);
  const [editingMsg, setEditingMsg] = useState<MessageRow | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [messageType, setMessageType] = useState<string>("text");
  const [triggerSource, setTriggerSource] = useState<string>("appointment");
  const [templateText, setTemplateText] = useState("");
  const [contentData, setContentData] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendInstance, setSendInstance] = useState<{ id: string; name: string } | null>(null);
  const [sendNumber, setSendNumber] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendDelay, setSendDelay] = useState("0");
  const [sendMessageId, setSendMessageId] = useState<string | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);

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

      setContentData((prev: any) => ({ 
        ...prev, 
        url: publicUrl, 
        filename: file.name,
        mediaType: file.type.startsWith('image/') ? 'image' : 
                   file.type.startsWith('video/') ? 'video' :
                   file.type.startsWith('audio/') ? 'audio' : 'document'
      }));
      toast.success("Arquivo enviado com sucesso!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const submitMessage = async (form: FormData) => {
    const name = String(form.get("name") ?? "").trim();
    const template = templateText.trim();

    if (!name) {
      toast.error("Nome do template é obrigatório");
      return;
    }

    if ((messageType === "text" || messageType === "button" || messageType === "list") && !template) {
      toast.error("O texto da mensagem é obrigatório");
      return;
    }

    if (messageType === "media" && !contentData.url) {
      toast.error("A URL da mídia é obrigatória");
      return;
    }

    if (messageType === "poll") {
      if (!template) {
        toast.error("A pergunta da enquete é obrigatória");
        return;
      }
      const options = contentData.pollOptions || [];
      if (options.filter((o: string) => o.trim()).length < 2) {
        toast.error("A enquete precisa de pelo menos 2 opções");
        return;
      }
    }

    if (selectedUnits.length === 0) {
      toast.error("Selecione pelo menos uma unidade");
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCompanyId: string;
      if (editingMsg) {
        resolvedCompanyId = editingMsg.company_id;
      } else {
        const { data: existing } = await supabase.from("companies").select("id").order("created_at").limit(1).maybeSingle();
        resolvedCompanyId = companyId || existing?.id || "";
      }
      const unit_ids = selectedUnits;
      const res = editingMsg
        ? await supabase
            .from("messages")
            .update({ 
              unit_ids, 
              name, 
              template: templateText, 
              message_type: messageType, 
              trigger_source: triggerSource,
              content_data: contentData, 
              active: form.get("active") === "on"
            })
            .eq("id", editingMsg.id)
        : await supabase.from("messages").insert({
            company_id: resolvedCompanyId,
            unit_ids,
            name,
            template: templateText,
            message_type: messageType,
            trigger_source: triggerSource,
            content_data: contentData,
            active: form.get("active") === "on",
          });
      if (res.error) throw new Error(res.error.message);
      toast.success(editingMsg ? "Atualizada" : "Criada");
      setMsgOpen(false);
      setEditingMsg(null);
      setSelectedUnits([]);
      setMessageType("text");
      setTriggerSource("appointment");
      setTemplateText("");
      setContentData({});
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
    const sameUnit = instances.filter((i) => m.unit_ids.includes(i.unit_id));
    const inst = sameUnit.find((i) => i.status === "connected") ?? sameUnit[0] ?? instances.find((i) => i.status === "connected") ?? instances[0];
    if (!inst) {
      toast.error("Cadastre uma instância primeiro");
      return;
    }
    setSendInstance({ id: inst.id, name: inst.name });
    setSendNumber("");
    setSendText(m.template);
    setSendDelay("0");
    setSendMessageId(m.id);
    setMessageType(m.message_type || "text");
    setContentData(m.content_data || {});
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
      const res = await sendEvogoMessage({
        data: {
          instanceId: sendInstance.id,
          number,
          text,
          delay,
          messageType,
          ...contentData,
          ...(sendMessageId ? { messageId: sendMessageId } : {}),
        },
      });
      toast.success(`Mensagem enviada para ${number}`);
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

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-6 py-4">Nome</TableHead>
              <TableHead>Unidades</TableHead>
              <TableHead>Conteúdo / Preview</TableHead>
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
                    <span className="text-sm text-muted-foreground">Carregando mensagens...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-16">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <MessageSquare className="h-12 w-12" />
                    <p>Nenhuma mensagem cadastrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              messages.map((m) => (
                <TableRow key={m.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="px-6 font-medium">
                    <div className="flex flex-col">
                      <span>{m.name}</span>
                      <Badge variant="outline" className="w-fit text-[10px] h-4 mt-1 capitalize font-bold tracking-tight px-1.5 border-primary/20 text-primary/70">
                        {m.message_type || "text"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(m.unit_ids || [])
                        .map((id) => units.find((u) => u.id === id))
                        .filter(Boolean) // Remove as unidades que não existem mais
                        .slice(0, 2)
                        .map((u) => (
                          <Badge key={u!.id} variant="outline" className="bg-muted/50 text-muted-foreground border-border text-[10px] px-1.5">
                            {u!.name}
                          </Badge>
                        ))}
                      {m.unit_ids && m.unit_ids.filter(id => !units.find(u => u.id === id)).length > 0 && (
                        /* Opcional: Log ou indicador interno se houver IDs órfãos */
                        null
                      )}
                      {m.unit_ids && m.unit_ids.filter(id => units.find(u => u.id === id)).length > 2 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 opacity-60">
                          +{m.unit_ids.filter(id => units.find(u => u.id === id)).length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-md">
                    <MessagePreview text={m.template} message={m} maxW="320px" />
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.active ? "default" : "secondary"} className={m.active ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                      {m.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right px-6">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" title="Enviar agora" onClick={() => openSendFromTemplate(m)}>
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-muted" title="Editar" onClick={() => {
                        setEditingMsg(m);
                        setSelectedUnits(m.unit_ids || []);
                        setMessageType(m.message_type || "text");
                        setTriggerSource((m as any).trigger_source || "appointment");
                        setTemplateText(m.template || "");
                        setContentData(m.content_data || {});
                        setMsgOpen(true);
                      }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDialog trigger={<Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 className="h-4 w-4" /></Button>} title="Excluir mensagem?" onConfirm={() => deleteMessage(m.id)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={msgOpen} onOpenChange={(o) => { 
        setMsgOpen(o); 
        if (!o) { 
          setEditingMsg(null); 
          setSelectedUnits([]); 
          setTemplateText("");
          setTriggerSource("appointment");
        } 
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMsg ? "Editar" : "Nova"} mensagem</DialogTitle>
          </DialogHeader>
          <form action={submitMessage} className="space-y-4">
            <div className="space-y-2">
              <Label>Unidades</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between">
                    {selectedUnits.length > 0 ? `${selectedUnits.length} unidade(s) selecionada(s)` : "Selecionar unidades"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar unidade..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma unidade encontrada.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={() => { const allIds = units.map((u) => u.id); setSelectedUnits(selectedUnits.length === units.length ? [] : allIds); }}>
                          <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedUnits.length === units.length ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}><Check className="h-4 w-4" /></div>
                          <span className="font-bold text-primary">Selecionar todas</span>
                        </CommandItem>
                        {units.map((unit) => (
                          <CommandItem key={unit.id} value={unit.name} onSelect={() => { setSelectedUnits((prev) => prev.includes(unit.id) ? prev.filter((id) => id !== unit.id) : [...prev, unit.id]); }}>
                            <div className={cn("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedUnits.includes(unit.id) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}><Check className="h-4 w-4" /></div>
                            {unit.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input name="name" required defaultValue={editingMsg?.name} placeholder="Ex: Lembrete de agendamento" />
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

            <div className="space-y-4 pt-2 border-t">
              {messageType === "media" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>URL da Mídia</Label>
                      <div className="flex gap-2">
                        <Input placeholder="https://..." value={contentData.url || ""} onChange={(e) => setContentData({ ...contentData, url: e.target.value })} />
                        <div className="relative">
                          <Button type="button" variant="outline" size="icon" disabled={uploading} className="shrink-0" onClick={() => document.getElementById("media-upload")?.click()}>
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          </Button>
                          <input id="media-upload" type="file" className="hidden" accept="*" onChange={handleFileUpload} />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Select value={contentData.mediaType || "image"} onValueChange={(v) => setContentData({ ...contentData, mediaType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div className="space-y-4">
                  <Label>Opções da Enquete (Pelo menos 2)</Label>
                  <div className="space-y-2">
                    {(contentData.pollOptions || ["", ""]).map((option: string, i: number) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder={`Opção ${i + 1}`} value={option} onChange={(e) => { const newOptions = [...(contentData.pollOptions || ["", ""])]; newOptions[i] = e.target.value; setContentData({ ...contentData, pollOptions: newOptions }); }} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => { const newOptions = (contentData.pollOptions || []).filter((_: any, idx: number) => idx !== i); setContentData({ ...contentData, pollOptions: newOptions }); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setContentData({ ...contentData, pollOptions: [...(contentData.pollOptions || []), ""] })}><Plus className="h-4 w-4 mr-2" /> Adicionar Opção</Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>{messageType === "media" ? "Legenda (opcional)" : messageType === "poll" ? "Pergunta" : "Template / Texto"}</Label>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Negrito" onClick={() => {
                      const el = document.getElementById("template-area") as HTMLTextAreaElement;
                      const start = el.selectionStart;
                      const end = el.selectionEnd;
                      const text = el.value;
                      const newText = text.substring(0, start) + "*" + text.substring(start, end) + "*" + text.substring(end);
                      setTemplateText(newText);
                    }}>
                      <span className="font-bold">B</span>
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Itálico" onClick={() => {
                      const el = document.getElementById("template-area") as HTMLTextAreaElement;
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
                          const el = document.getElementById("template-area") as HTMLTextAreaElement;
                          const start = el.selectionStart;
                          const end = el.selectionEnd;
                          const text = el.value;
                          const tag = `{{${v.value}}}`;
                          const newText = text.substring(0, start) + tag + text.substring(end);
                          setTemplateText(newText);
                          // Tenta focar de volta
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
                  id="template-area"
                  name="template" 
                  rows={6} 
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  placeholder="Digite aqui..." 
                  className="font-sans"
                />
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch name="active" defaultChecked={editingMsg?.active ?? true} id="mact" /><Label htmlFor="mact">Ativa</Label></div>
            <DialogFooter><Button type="submit" disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />Enviar mensagem</DialogTitle></DialogHeader>
          <form onSubmit={submitSend} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="sendNumber">Número</Label><Input id="sendNumber" value={sendNumber} onChange={(e) => setSendNumber(e.target.value)} placeholder="5511999999999" /></div>
            <div className="space-y-2"><Label htmlFor="sendText">Mensagem</Label><Textarea id="sendText" rows={5} value={sendText} onChange={(e) => setSendText(e.target.value)} placeholder="Digite a mensagem..." /></div>
            <DialogFooter><Button type="submit" disabled={sendSubmitting}>{sendSubmitting ? "Enviando..." : "Enviar"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
