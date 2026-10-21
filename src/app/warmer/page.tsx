"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Flame,
  Plus,
  Play,
  Pause,
  Trash2,
  QrCode,
  Loader2,
  Users,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Phone,
  ShieldCheck,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  createNumberAction,
  getNumberQrAction,
  toggleNumberAction,
  deleteNumberAction,
  runWarmerTickAction,
} from "./actions";

export default function WarmerPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();

  // Estados de modais e ações
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [newChipName, setNewChipName] = useState("");
  const [creatingChip, setCreatingChip] = useState(false);
  const [activeQrChipId, setActiveQrChipId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [runningTick, setRunningTick] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. Busca lista de chips de aquecimento da empresa
  const { data: chips = [], isLoading: loadingChips } = useQuery({
    queryKey: ["warmer-numbers", companyId],
    queryFn: async () => {
      let query = supabase
        .from("warmer_numbers")
        .select("*")
        .order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) {
        console.warn("Tabelas de aquecimento ainda não inicializadas:", error.message);
        return [];
      }
      return data ?? [];
    },
    refetchInterval: 8000,
  });

  // 2. Busca grupos de aquecimento da empresa
  const { data: groups = [] } = useQuery({
    queryKey: ["warmer-groups", companyId],
    queryFn: async () => {
      let query = supabase.from("warmer_groups").select("*").order("created_at", { ascending: false });
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 12000,
  });

  // 3. Busca últimas mensagens trocadas no aquecedor
  const { data: messages = [] } = useQuery({
    queryKey: ["warmer-messages", companyId],
    queryFn: async () => {
      let query = supabase
        .from("warmer_messages")
        .select("*, from_num:from_number_id(name), to_num:to_number_id(name)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (companyId) query = query.eq("company_id", companyId);
      const { data, error } = await query;
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 6000,
  });

  // Polling para checar conexão enquanto o QR Code estiver aberto
  useEffect(() => {
    if (!activeQrChipId) return;
    const interval = setInterval(async () => {
      const res = await getNumberQrAction(activeQrChipId);
      if (res.success && res.data) {
        if (res.data.status === "warming" || res.data.phoneNumber) {
          toast.success("WhatsApp conectado com sucesso!");
          setActiveQrChipId(null);
          setConnectModalOpen(false);
          qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
        } else if (res.data.qrCode) {
          setQrCodeData(res.data.qrCode);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeQrChipId, qc]);

  // Ação: Iniciar conexão de novo chip
  const handleStartConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChipName.trim()) {
      toast.error("Informe um nome para identificar o chip.");
      return;
    }
    if (!companyId) {
      toast.error("Empresa não identificada.");
      return;
    }

    setCreatingChip(true);
    const res = await createNumberAction({
      companyId,
      name: newChipName.trim(),
    });
    setCreatingChip(false);

    if (res.success && res.data) {
      setActiveQrChipId(res.data.number.id);
      setQrCodeData(res.data.qrCode);
      setNewChipName("");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao criar instância: " + (res.error || "Erro desconhecido"));
    }
  };

  // Ação: Reabrir QR Code de chip desconectado
  const handleOpenQrForExisting = async (chipId: string) => {
    setActiveQrChipId(chipId);
    setConnectModalOpen(true);
    setQrCodeData(null);
    const res = await getNumberQrAction(chipId);
    if (res.success && res.data?.qrCode) {
      setQrCodeData(res.data.qrCode);
    }
  };

  // Ação: Pausar ou Retomar Aquecimento
  const handleToggleStatus = async (chip: any) => {
    const isPaused = chip.status === "paused";
    const res = await toggleNumberAction({
      numberId: chip.id,
      pause: !isPaused,
    });
    if (res.success) {
      toast.success(isPaused ? "Chip retomado no aquecedor" : "Chip pausado");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao alterar status: " + res.error);
    }
  };

  // Ação: Excluir Chip
  const handleDelete = async (chipId: string) => {
    if (!confirm("Tem certeza que deseja remover este chip do aquecedor?")) return;
    setDeletingId(chipId);
    const res = await deleteNumberAction(chipId);
    setDeletingId(null);
    if (res.success) {
      toast.success("Chip removido do aquecedor.");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao excluir: " + res.error);
    }
  };

  // Ação: Forçar ciclo manual do motor
  const handleRunManualTick = async () => {
    setRunningTick(true);
    const res = await runWarmerTickAction();
    setRunningTick(false);
    if (res.success) {
      toast.success("Ciclo do aquecedor executado com sucesso!");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
      qc.invalidateQueries({ queryKey: ["warmer-messages"] });
    } else {
      toast.error("Falha ao executar ciclo: " + res.error);
    }
  };

  // Métricas de resumo
  const totalConnected = chips.filter((c: any) => c.status === "warming" || c.status === "idle").length;
  const totalWarming = chips.filter((c: any) => (c.status === "warming" || c.status === "idle") && c.current_day < 14).length;
  const totalHot = chips.filter((c: any) => c.current_day >= 14).length;
  const msgsSentToday = chips.reduce((acc: number, c: any) => acc + (c.messages_sent_today || 0), 0);
  const msgsReceivedToday = chips.reduce((acc: number, c: any) => acc + (c.messages_received_today || 0), 0);

  return (
    <AppLayout title="Aquecedor de Números">
      <div className="flex flex-col gap-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Flame className="h-6 w-6 text-amber-500 fill-amber-500/20" />
              Aquecedor de Números
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Maturação automatizada em nuvem: conversas 1x1 com IA anti-looping e grupos compartilhados.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunManualTick}
              disabled={runningTick}
              className="w-full sm:w-auto"
            >
              {runningTick ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin text-primary" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Rodar Ciclo Agora
            </Button>
            <Button
              onClick={() => {
                setActiveQrChipId(null);
                setQrCodeData(null);
                setConnectModalOpen(true);
              }}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Conectar Novo Chip
            </Button>
          </div>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Chips Conectados</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {totalConnected}
                <Phone className="h-4 w-4 text-primary opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Total cadastrado: {chips.length}</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Aquecendo Ativos</CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-500 flex items-center justify-between">
                {totalWarming}
                <Flame className="h-4 w-4 text-amber-500 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Em maturação progressiva</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Chips Prontos / Quentes</CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-500 flex items-center justify-between">
                {totalHot}
                <ShieldCheck className="h-4 w-4 text-emerald-500 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Prontos para campanhas</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Mensagens Hoje</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {msgsSentToday + msgsReceivedToday}
                <MessageSquare className="h-4 w-4 text-primary opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                ↑ {msgsSentToday} enviadas · ↓ {msgsReceivedToday} recebidas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Abas Principais */}
        <Tabs defaultValue="chips" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="chips" className="gap-2">
              <Flame className="h-4 w-4" />
              Chips em Aquecimento ({chips.length})
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <Users className="h-4 w-4" />
              Grupos Coletivos ({groups.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Clock className="h-4 w-4" />
              Feed ao Vivo
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: Lista de Chips */}
          <TabsContent value="chips" className="space-y-4">
            {loadingChips ? (
              <div className="py-20 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Carregando chips...</p>
              </div>
            ) : chips.length === 0 ? (
              <Card className="glass border-dashed text-center py-16">
                <CardContent className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Flame className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-lg">Nenhum chip conectado ainda</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Conecte pelo menos 2 chips de WhatsApp para que eles comecem a conversar entre si e interagir nos grupos automaticamente.
                  </p>
                  <Button
                    onClick={() => {
                      setActiveQrChipId(null);
                      setQrCodeData(null);
                      setConnectModalOpen(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Conectar Primeiro Chip
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {chips.map((chip: any) => {
                  const isConnected = chip.status === "warming" || chip.status === "idle";
                  const isPaused = chip.status === "paused";
                  const isConnecting = chip.status === "connecting";
                  const isHot = (chip.current_day || 1) >= 14;
                  const healthPct = Math.min(100, Math.round(((chip.current_day || 1) / 14) * 100));

                  return (
                    <Card key={chip.id} className="glass hover:border-primary/40 transition-all flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base font-semibold">{chip.name}</CardTitle>
                            <CardDescription className="font-mono text-xs mt-0.5">
                              {chip.phone_number ? `+${chip.phone_number}` : "Aguardando conexão..."}
                            </CardDescription>
                          </div>
                          {isPaused ? (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              Pausado
                            </Badge>
                          ) : isConnecting ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                              Conectando...
                            </Badge>
                          ) : isHot ? (
                            <Badge className="bg-emerald-600 text-white gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Aquecido 🔥
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 gap-1 animate-pulse">
                              <Flame className="h-3 w-3" />
                              Aquecendo
                            </Badge>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pb-4">
                        {/* Régua de Maturação */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Maturidade do Chip</span>
                            <span className="font-medium text-foreground">
                              Dia {chip.current_day || 1} de 14 ({healthPct}%)
                            </span>
                          </div>
                          <Progress value={healthPct} className="h-2" />
                        </div>

                        {/* Estatísticas de Mensagens */}
                        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/40">
                          <div>
                            <span className="text-muted-foreground block">Hoje:</span>
                            <span className="font-semibold text-foreground">
                              ↑ {chip.messages_sent_today || 0} / ↓ {chip.messages_received_today || 0}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Total:</span>
                            <span className="font-semibold text-foreground">
                              {chip.total_messages_sent || 0} trocadas
                            </span>
                          </div>
                        </div>

                        {/* Ações do Chip */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          {isConnected || isPaused ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8 px-2"
                              onClick={() => handleToggleStatus(chip)}
                            >
                              {isPaused ? (
                                <>
                                  <Play className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Retomar
                                </>
                              ) : (
                                <>
                                  <Pause className="h-3.5 w-3.5 mr-1 text-amber-500" /> Pausar
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => handleOpenQrForExisting(chip.id)}
                            >
                              <QrCode className="h-3.5 w-3.5 mr-1" /> Ler QR Code
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/70 hover:text-destructive"
                            onClick={() => handleDelete(chip.id)}
                            disabled={deletingId === chip.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ABA 2: Grupos de Aquecimento */}
          <TabsContent value="groups">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-lg">Grupos Coletivos de Aquecimento</CardTitle>
                <CardDescription>
                  Grupos criados automaticamente onde seus chips interagem juntos, mandando mensagens, figurinhas e respondendo enquetes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {groups.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm space-y-2">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p>Nenhum grupo ativo no momento.</p>
                    <p className="text-xs">
                      Assim que você tiver 2 ou mais chips conectados, o sistema criará o primeiro grupo de aquecimento automaticamente.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome do Grupo</TableHead>
                        <TableHead>Membros Conectados</TableHead>
                        <TableHead>Última Interação</TableHead>
                        <TableHead>Data de Criação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groups.map((g: any) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            {g.group_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{g.members_count} chips</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.last_interaction_at
                              ? format(new Date(g.last_interaction_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : "Recentemente"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(g.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 3: Feed ao Vivo */}
          <TabsContent value="logs">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-lg">Feed de Conversas ao Vivo</CardTitle>
                <CardDescription>
                  Registro em tempo real das mensagens trocadas entre os seus chips e nos grupos de aquecimento.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p>Nenhuma mensagem trocada ainda.</p>
                    <p className="text-xs mt-1">
                      As interações aparecem aqui assim que os chips começarem os diálogos no motor de aquecimento.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Remetente</TableHead>
                        <TableHead>Destinatário</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Horário</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-semibold text-xs whitespace-nowrap">
                            {m.from_num?.name || m.from_phone || "Chip"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {m.group_id ? (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Users className="h-3 w-3" /> Grupo
                              </Badge>
                            ) : (
                              m.to_num?.name || m.to_phone || "Chip"
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-md truncate">
                            {m.content}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {m.created_at
                              ? format(new Date(m.created_at), "HH:mm:ss · dd/MM", { locale: ptBR })
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal: Conectar Chip via QR Code */}
        <Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-500" />
                Conectar Chip de WhatsApp
              </DialogTitle>
              <DialogDescription>
                Conecte seu WhatsApp lendo o QR Code abaixo para adicioná-lo ao aquecedor.
              </DialogDescription>
            </DialogHeader>

            {!activeQrChipId ? (
              <form onSubmit={handleStartConnect} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="chipName">Identificação do Chip</Label>
                  <Input
                    id="chipName"
                    placeholder="Ex: Chip 01 - Comercial"
                    value={newChipName}
                    onChange={(e) => setNewChipName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Um nome para você saber de quem é o chip no painel.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={creatingChip} className="bg-amber-600 hover:bg-amber-700 text-white">
                    {creatingChip ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando QR Code...
                      </>
                    ) : (
                      <>
                        <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto grid h-64 w-64 place-items-center rounded-xl bg-white p-3 border shadow-sm">
                  {qrCodeData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCodeData} alt="QR Code WhatsApp" className="h-full w-full object-contain" />
                  ) : (
                    <div className="space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mx-auto" />
                      <p className="text-xs text-muted-foreground">Carregando QR Code...</p>
                    </div>
                  )}
                </div>

                <ol className="text-xs text-muted-foreground text-left space-y-1 list-decimal list-inside px-2">
                  <li>Abra o WhatsApp no celular</li>
                  <li>Vá em <strong>Aparelhos conectados</strong></li>
                  <li>Toque em <strong>Conectar um aparelho</strong> e aponte para a tela</li>
                </ol>

                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Aguardando leitura do WhatsApp...
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
