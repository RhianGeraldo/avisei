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
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  Server,
  Camera,
  Globe,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  createNumberAction,
  getNumberQrAction,
  toggleNumberAction,
  refreshChipProfileAction,
  deleteNumberAction,
  graduateNumberAction,
  runWarmerTickAction,
  updateChipTogglesAction,
} from "./actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    .insert({ name: "Empresa Principal" })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao identificar empresa: ${error.message}`);
  return created.id;
}

export default function WarmerPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();

  // Garante identificação da empresa mesmo para super admin ou quando companyId estiver em carregamento
  const { data: effectiveCompanyId } = useQuery({
    queryKey: ["effective-company-id", companyId],
    queryFn: () => resolveCompanyId(companyId),
    staleTime: 60000,
  });

  const activeCompanyId = effectiveCompanyId || companyId || undefined;

  // Estados de modais e ações
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [newChipName, setNewChipName] = useState("");
  const [creatingChip, setCreatingChip] = useState(false);
  const [activeQrChipId, setActiveQrChipId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [runningTick, setRunningTick] = useState(false);
  const [chipToDelete, setChipToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [graduatingChip, setGraduatingChip] = useState<any | null>(null);
  const [graduating, setGraduating] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [updatingToggleId, setUpdatingToggleId] = useState<string | null>(null);
  const [connectedProfile, setConnectedProfile] = useState<{
    phone?: string;
    profileName?: string;
    profilePictureUrl?: string;
  } | null>(null);

  // 1. Busca lista de chips de aquecimento da empresa
  const { data: chips = [], isLoading: loadingChips } = useQuery({
    queryKey: ["warmer-numbers", activeCompanyId],
    queryFn: async () => {
      let query = supabase
        .from("warmer_numbers")
        .select("*")
        .order("created_at", { ascending: false });
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
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
    queryKey: ["warmer-groups", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("warmer_groups").select("*").order("created_at", { ascending: false });
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 12000,
  });

  // 3. Busca últimas mensagens trocadas no aquecedor
  const { data: messages = [] } = useQuery({
    queryKey: ["warmer-messages", activeCompanyId],
    queryFn: async () => {
      let query = supabase
        .from("warmer_messages")
        .select("*, from_num:from_number_id(name), to_num:to_number_id(name)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
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
          const profileData = {
            phone: res.data.phoneNumber,
            profileName: (res.data as any).profileName,
            profilePictureUrl: (res.data as any).profilePictureUrl,
          };
          setConnectedProfile(profileData);
          toast.success("WhatsApp conectado com sucesso!");
          setActiveQrChipId(null);
          qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
          // Aguarda 3 segundos mostrando a confirmação com avatar/nome antes de fechar o modal
          setTimeout(() => {
            setConnectModalOpen(false);
            setConnectedProfile(null);
          }, 3200);
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

    setCreatingChip(true);
    let targetCompanyId = activeCompanyId;
    if (!targetCompanyId) {
      targetCompanyId = await resolveCompanyId(companyId).catch(() => undefined);
    }

    const res = await createNumberAction({
      companyId: targetCompanyId,
      name: newChipName.trim(),
    });
    setCreatingChip(false);

    if (res.success && res.data) {
      setConnectedProfile(null);
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
    setConnectedProfile(null);
    setActiveQrChipId(chipId);
    setConnectModalOpen(true);
    setQrCodeData(null);
    const res = await getNumberQrAction(chipId);
    if (res.success && res.data?.qrCode) {
      setQrCodeData(res.data.qrCode);
    }
  };

  // Ação: Sincronizar Perfil (Foto e Nome do WhatsApp)
  const handleRefreshProfile = async (chipId: string) => {
    setRefreshingId(chipId);
    const res = await refreshChipProfileAction(chipId);
    setRefreshingId(null);
    if (res.success) {
      toast.success("Perfil do WhatsApp sincronizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao sincronizar perfil: " + (res.error || "Erro"));
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

  // Ação: Liga/Desliga individual de módulo do chip (Estilo MaturaGo)
  const handleToggleModule = async (
    chipId: string,
    field: "enable_dialogs" | "enable_groups" | "enable_status" | "enable_external",
    newValue: boolean
  ) => {
    setUpdatingToggleId(`${chipId}-${field}`);
    const res = await updateChipTogglesAction(chipId, { [field]: newValue });
    setUpdatingToggleId(null);
    if (res.success) {
      toast.success("Módulo do chip atualizado!");
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao atualizar módulo: " + res.error);
    }
  };

  // Ação: Confirmar Exclusão de Chip do Aquecedor
  const handleConfirmDelete = async () => {
    if (!chipToDelete) return;
    setIsDeleting(true);
    const res = await deleteNumberAction(chipToDelete.id);
    setIsDeleting(false);
    if (res.success) {
      toast.success(`Chip "${chipToDelete.name}" removido do aquecedor.`);
      setChipToDelete(null);
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

  // Ação: Concluir / Graduar Chip para transferência
  const handleConfirmGraduate = async () => {
    if (!graduatingChip) return;
    setGraduating(true);
    const res = await graduateNumberAction(graduatingChip.id);
    setGraduating(false);
    if (res.success) {
      toast.success(
        `Chip ${graduatingChip.name} graduado com sucesso! Sessão desconectada para transferência.`
      );
      setGraduatingChip(null);
      qc.invalidateQueries({ queryKey: ["warmer-numbers"] });
    } else {
      toast.error("Falha ao graduar chip: " + res.error);
    }
  };

  // Métricas de resumo (separando ativos de graduados/transferidos)
  const activeChips = chips.filter((c: any) => c.status !== "graduated");
  const graduatedChips = chips.filter((c: any) => c.status === "graduated");
  const totalConnected = activeChips.filter((c: any) => c.status === "warming" || c.status === "idle").length;
  const totalWarming = activeChips.filter((c: any) => (c.status === "warming" || c.status === "idle") && c.current_day < 14).length;
  const totalHot = activeChips.filter((c: any) => c.current_day >= 14).length;
  const totalGraduated = graduatedChips.length;
  const msgsSentToday = activeChips.reduce((acc: number, c: any) => acc + (c.messages_sent_today || 0), 0);
  const msgsReceivedToday = activeChips.reduce((acc: number, c: any) => acc + (c.messages_received_today || 0), 0);

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Chips Ativos</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {totalConnected}
                <Phone className="h-4 w-4 text-primary opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Em aquecimento</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Aquecendo (Dia &lt; 14)</CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-500 flex items-center justify-between">
                {totalWarming}
                <Flame className="h-4 w-4 text-amber-500 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Maturando na esteira</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Prontos / Quentes</CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-500 flex items-center justify-between">
                {totalHot}
                <ShieldCheck className="h-4 w-4 text-emerald-500 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Prontos p/ transferir</p>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Graduados 🎓</CardDescription>
              <CardTitle className="text-2xl font-bold text-blue-500 flex items-center justify-between">
                {totalGraduated}
                <GraduationCap className="h-4 w-4 text-blue-500 opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Já transferidos</p>
            </CardContent>
          </Card>

          <Card className="glass col-span-2 lg:col-span-1">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Mensagens Hoje</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {msgsSentToday + msgsReceivedToday}
                <MessageSquare className="h-4 w-4 text-primary opacity-70" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                ↑ {msgsSentToday} · ↓ {msgsReceivedToday}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Abas Principais */}
        <Tabs defaultValue="chips" className="space-y-4">
          <TabsList className="bg-muted/50 p-1 flex-wrap">
            <TabsTrigger value="chips" className="gap-2">
              <Flame className="h-4 w-4 text-amber-500" />
              Chips em Aquecimento ({activeChips.length})
            </TabsTrigger>
            <TabsTrigger value="graduated" className="gap-2">
              <GraduationCap className="h-4 w-4 text-blue-500" />
              Histórico de Graduados ({graduatedChips.length})
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <Users className="h-4 w-4 text-primary" />
              Grupos Coletivos ({groups.length})
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
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
            ) : activeChips.length === 0 ? (
              <Card className="glass border-dashed text-center py-16">
                <CardContent className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Flame className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-lg">Nenhum chip ativo na esteira</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Conecte novos chips de WhatsApp para iniciar a maturação automatizada com IA anti-looping e grupos.
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
                    Conectar Novo Chip
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeChips.map((chip: any) => {
                  const isConnected = chip.status === "warming" || chip.status === "idle";
                  const isPaused = chip.status === "paused";
                  const isConnecting = chip.status === "connecting";
                  const isHot = (chip.current_day || 1) >= 14;
                  const healthPct = Math.min(100, Math.round(((chip.current_day || 1) / 14) * 100));

                  return (
                    <Card key={chip.id} className="glass hover:border-primary/40 transition-all flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-11 w-11 border border-border/60 shrink-0">
                              <AvatarImage src={chip.profile_picture_url || undefined} alt={chip.profile_name || chip.name} />
                              <AvatarFallback className="bg-amber-500/10 text-amber-600 font-semibold text-sm">
                                {(chip.profile_name || chip.name || "W").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <CardTitle className="text-base font-semibold truncate" title={chip.name}>
                                {chip.name}
                              </CardTitle>
                              {chip.profile_name && (
                                <p className="text-xs text-muted-foreground truncate font-medium" title={chip.profile_name}>
                                  {chip.profile_name}
                                </p>
                              )}
                              <CardDescription className="font-mono text-xs mt-0.5">
                                {chip.phone_number ? `+${chip.phone_number}` : "Aguardando conexão..."}
                              </CardDescription>
                              <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/80 mt-1 truncate">
                                <Server className="h-3 w-3 shrink-0 opacity-70 text-amber-500" />
                                <span className="truncate" title={`Instância: ${chip.evogo_instance_name}`}>
                                  {chip.evogo_instance_name}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0">
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

                        {/* Controles de Módulos (Liga/Desliga estilo MaturaGo) */}
                        <div className="space-y-2 pt-1 border-t border-border/40">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Módulos de Aquecimento
                            </span>
                            {isPaused && (
                              <span className="text-[10px] text-muted-foreground italic">
                                (Pausado geral)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div className="flex flex-col items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-2 rounded-md border border-border/40 text-center gap-1.5">
                              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                                <MessageSquare className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                1x1 Diálogos
                              </span>
                              <Switch
                                checked={chip.enable_dialogs !== false}
                                onCheckedChange={(checked) => handleToggleModule(chip.id, "enable_dialogs", checked)}
                                disabled={isPaused || updatingToggleId === `${chip.id}-enable_dialogs`}
                                className="scale-75"
                              />
                            </div>

                            <div className="flex flex-col items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-2 rounded-md border border-border/40 text-center gap-1.5">
                              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                                <Users className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                Grupos
                              </span>
                              <Switch
                                checked={chip.enable_groups !== false}
                                onCheckedChange={(checked) => handleToggleModule(chip.id, "enable_groups", checked)}
                                disabled={isPaused || updatingToggleId === `${chip.id}-enable_groups`}
                                className="scale-75"
                              />
                            </div>

                            <div className="flex flex-col items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-2 rounded-md border border-border/40 text-center gap-1.5">
                              <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                                <Globe className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                Rede Fora
                              </span>
                              <Switch
                                checked={chip.enable_external !== false}
                                onCheckedChange={(checked) => handleToggleModule(chip.id, "enable_external", checked)}
                                disabled={isPaused || updatingToggleId === `${chip.id}-enable_external`}
                                className="scale-75"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Ações do Chip */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
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

                            {isConnected && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleRefreshProfile(chip.id)}
                                  disabled={refreshingId === chip.id}
                                  title="Atualizar foto e nome do WhatsApp"
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshingId === chip.id ? "animate-spin text-primary" : ""}`} />
                                  Sincronizar
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-8 px-2 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                                  onClick={() => setGraduatingChip(chip)}
                                  title="Concluir aquecimento e transferir chip"
                                >
                                  <GraduationCap className="h-3.5 w-3.5 mr-1" /> Graduar
                                </Button>
                              </>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => setChipToDelete(chip)}
                            title="Remover chip do aquecedor"
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

          {/* ABA: Histórico de Graduados */}
          <TabsContent value="graduated">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-blue-500" />
                  Histórico de Chips Aquecidos & Transferidos
                </CardTitle>
                <CardDescription>
                  Registro permanente de todos os números que concluíram a maturação e foram liberados para a operação comercial.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {graduatedChips.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
                    <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="font-medium">Nenhum chip graduado ainda.</p>
                    <p className="text-xs max-w-sm mx-auto">
                      Assim que um chip atingir a maturidade desejada (Dia 14) e você transferi-lo para outro aparelho, ele ficará registrado aqui.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Identificação</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Dias de Aquecimento</TableHead>
                        <TableHead>Total de Mensagens</TableHead>
                        <TableHead>Data de Graduação</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {graduatedChips.map((g: any) => (
                        <TableRow key={g.id}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 border shrink-0">
                                <AvatarImage src={g.profile_picture_url || undefined} alt={g.profile_name || g.name} />
                                <AvatarFallback className="text-xs bg-muted">
                                  {(g.profile_name || g.name || "W").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{g.name}</p>
                                {g.profile_name && (
                                  <p className="text-xs text-muted-foreground truncate">{g.profile_name}</p>
                                )}
                                <p className="text-[10px] font-mono text-muted-foreground/80 flex items-center gap-1 mt-0.5">
                                  <Server className="h-2.5 w-2.5 opacity-60 text-amber-500" />
                                  {g.evogo_instance_name}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {g.phone_number ? `+${g.phone_number}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            Dia {g.current_day || 14} de 14
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {g.total_messages_sent || 0} msgs
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {g.graduated_at
                              ? format(new Date(g.graduated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : format(new Date(g.updated_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-emerald-600/15 text-emerald-600 border-emerald-500/30 gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Aquecido & Transferido
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
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
                            ) : m.message_type === "status" || m.to_jid === "status@broadcast" ? (
                              <Badge variant="outline" className="text-xs gap-1 text-purple-600 border-purple-500/30 bg-purple-500/10">
                                <Camera className="h-3 w-3" /> Status WhatsApp
                              </Badge>
                            ) : (
                              m.to_num?.name || (m.to_phone ? `+${m.to_phone}` : "1x1 Direto")
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
        <Dialog
          open={connectModalOpen}
          onOpenChange={(open) => {
            setConnectModalOpen(open);
            if (!open) {
              setActiveQrChipId(null);
              setQrCodeData(null);
              setConnectedProfile(null);
            }
          }}
        >
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

            {connectedProfile ? (
              <div className="space-y-4 text-center py-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center animate-bounce">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground">WhatsApp Conectado!</h3>
                  <p className="text-xs text-muted-foreground">
                    Perfil identificado e vinculado à esteira com sucesso.
                  </p>
                </div>

                <div className="mx-auto max-w-sm bg-muted/40 p-4 rounded-xl border flex items-center gap-3.5 text-left">
                  <Avatar className="h-12 w-12 border border-border/60 shrink-0">
                    <AvatarImage src={connectedProfile.profilePictureUrl || undefined} alt={connectedProfile.profileName || "WhatsApp"} />
                    <AvatarFallback className="bg-emerald-500/15 text-emerald-600 font-bold text-sm">
                      {(connectedProfile.profileName || "W").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate text-foreground">
                      {connectedProfile.profileName || "Perfil do WhatsApp"}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {connectedProfile.phone ? `+${connectedProfile.phone}` : "Número identificado"}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      Sincronizado
                    </Badge>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 animate-pulse pt-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Iniciando ciclo de maturação...
                </p>
              </div>
            ) : !activeQrChipId ? (
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

        {/* Modal: Confirmação de Exclusão de Chip */}
        <Dialog open={!!chipToDelete} onOpenChange={(open) => !open && !isDeleting && setChipToDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Remover Chip do Aquecedor
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir esta instância de aquecimento?
              </DialogDescription>
            </DialogHeader>

            {chipToDelete && (
              <div className="space-y-4 pt-1">
                <div className="bg-muted/40 p-3 rounded-lg border text-sm space-y-2">
                  <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <Avatar className="h-10 w-10 border border-border/60 shrink-0">
                      <AvatarImage src={chipToDelete.profile_picture_url || undefined} alt={chipToDelete.profile_name || chipToDelete.name} />
                      <AvatarFallback className="bg-destructive/15 text-destructive font-semibold text-xs">
                        {(chipToDelete.profile_name || chipToDelete.name || "W").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{chipToDelete.name}</p>
                      {chipToDelete.profile_name && (
                        <p className="text-xs text-muted-foreground truncate">{chipToDelete.profile_name}</p>
                      )}
                      <p className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Server className="h-3 w-3 text-amber-500 opacity-80" />
                        {chipToDelete.evogo_instance_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Telefone conectado:</span>
                    <span className="font-mono font-medium">
                      {chipToDelete.phone_number ? `+${chipToDelete.phone_number}` : "Não conectado"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Mensagens trocadas:</span>
                    <span className="font-medium">
                      {(chipToDelete.total_messages_sent || 0) + (chipToDelete.total_messages_received || 0)} msgs
                    </span>
                  </div>
                </div>

                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Atenção: Ação Irreversível
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Ao confirmar, a instância vinculada no EvoGo será excluída, a conexão do WhatsApp será encerrada e todos os diálogos pendentes deste chip serão cancelados.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setChipToDelete(null)}
                    disabled={isDeleting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removendo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-1.5" /> Confirmar Exclusão
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal: Graduar e Transferir Chip */}
        <Dialog open={!!graduatingChip} onOpenChange={(open) => !open && setGraduatingChip(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <GraduationCap className="h-5 w-5" />
                Graduar e Transferir Chip
              </DialogTitle>
              <DialogDescription>
                Conclua a maturação deste número para liberá-lo com segurança para a sua equipe de vendas ou operação.
              </DialogDescription>
            </DialogHeader>

            {graduatingChip && (
              <div className="space-y-4 pt-1">
                <div className="bg-muted/40 p-3 rounded-lg border text-sm space-y-2">
                  <div className="flex items-center gap-3 pb-2 border-b border-border/50">
                    <Avatar className="h-10 w-10 border border-border/60 shrink-0">
                      <AvatarImage src={graduatingChip.profile_picture_url || undefined} alt={graduatingChip.profile_name || graduatingChip.name} />
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-600 font-semibold text-xs">
                        {(graduatingChip.profile_name || graduatingChip.name || "W").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{graduatingChip.name}</p>
                      {graduatingChip.profile_name && (
                        <p className="text-xs text-muted-foreground truncate">{graduatingChip.profile_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Instância EvoGo:</span>
                    <span className="font-mono text-xs flex items-center gap-1 text-foreground">
                      <Server className="h-3 w-3 text-amber-500 opacity-80" />
                      {graduatingChip.evogo_instance_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Número:</span>
                    <span className="font-mono font-medium">
                      {graduatingChip.phone_number ? `+${graduatingChip.phone_number}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dias de Aquecimento:</span>
                    <span className="font-medium text-emerald-600">
                      Dia {graduatingChip.current_day || 14} de 14
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mensagens Trocadas:</span>
                    <span className="font-medium">
                      {graduatingChip.total_messages_sent || 0} enviadas
                    </span>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    Orientações de Contingência para o Celular:
                  </p>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                    <li>
                      A sessão deste chip no aquecedor será <strong>desconectada</strong> para você poder usá-lo livremente no celular definitivo.
                    </li>
                    <li>
                      No aparelho de onde ele saiu, <strong>limpe os dados do WhatsApp</strong> (no Android em Configurações &gt; Apps &gt; Limpar Dados, ou reinstale no iPhone).
                    </li>
                    <li>
                      Ao cadastrar o próximo chip virgem no aparelho, faça a ativação usando o <strong>4G/5G</strong> da linha nova para evitar cruzamento de dados.
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setGraduatingChip(null)}
                    disabled={graduating}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirmGraduate}
                    disabled={graduating}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {graduating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Graduando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar e Desconectar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
