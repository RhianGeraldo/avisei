"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import { Card } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchEvogoGroups, fetchEvogoGroupInfo } from "@/lib/evogo";
import { Users, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

export default function GroupsPage() {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  
  const { companyId } = useAuth();

  // Fetch all instances
  const { data: instances = [], isLoading: loadingInstances } = useQuery({
    queryKey: ["all-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id, name, status")
        .eq("status", "connected") // Only show connected instances
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch groups when instance is selected
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ["groups", selectedInstanceId],
    queryFn: async () => {
      if (!selectedInstanceId) return [];
      try {
        const result = await fetchEvogoGroups({ data: { instanceId: selectedInstanceId } });
        console.log("Groups response:", JSON.stringify(result).substring(0, 500));
        return Array.isArray(result) ? result : (result?.data || []);
      } catch (err: any) {
        toast.error("Falha ao buscar grupos: " + err.message);
        return [];
      }
    },
    enabled: !!selectedInstanceId,
  });

  // Fetch all units for the import selection
  const { data: units = [], isLoading: loadingUnits } = useQuery({
    queryKey: ["all-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch group info (participants)
  const groupInfoMutation = useMutation({
    mutationFn: async (groupJid: string) => {
      return await fetchEvogoGroupInfo({ data: { instanceId: selectedInstanceId, groupJid } });
    },
    onSuccess: (data) => {
      setSelectedGroup(data);
    },
    onError: (err: any) => {
      toast.error("Falha ao buscar informações do grupo: " + err.message);
    }
  });

  const handleGroupClick = (group: any) => {
    // Some endpoints return id as string, some as object. Handle both.
    const groupJid = typeof group.JID === 'string' ? group.JID : typeof group.id === 'string' ? group.id : group.id?._serialized || group.jid;
    if (!groupJid) {
      toast.error("ID do grupo não encontrado");
      return;
    }
    // Set a placeholder with basic info while loading
    setSelectedGroup({ subject: group.Name || group.subject || group.name, loading: true });
    groupInfoMutation.mutate(groupJid);
  };

  const handleImportContacts = () => {
    if (!selectedGroup) return;
    if (!selectedGroup.Participants && !selectedGroup.participants) {
      toast.error("Erro: Nenhum participante encontrado neste grupo.");
      return;
    }
    setUnitModalOpen(true);
  };

  const confirmImport = async () => {
    if (!selectedUnitId) {
      toast.error("Erro: Selecione uma unidade primeiro.");
      return;
    }
    
    setImporting(true);
    try {
      const participantsArray = selectedGroup.Participants || selectedGroup.participants;
      const groupJid = typeof selectedGroup.JID === 'string' ? selectedGroup.JID : typeof selectedGroup.id === 'string' ? selectedGroup.id : selectedGroup.id?._serialized || selectedGroup.jid;
      const groupName = selectedGroup.Name || selectedGroup.subject || selectedGroup.name || "Grupo sem nome";

      const res = await fetch('/api/contacts/import-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          unitId: selectedUnitId,
          groupName,
          groupJid,
          participants: participantsArray
        })
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      
      toast.success(`${data.stats.inserted} adicionados, ${data.stats.updated} atualizados!`);
      setUnitModalOpen(false);
    } catch (err: any) {
      toast.error("Falha ao importar contatos: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout title="Grupos">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <p className="text-muted-foreground">
            Visualize e gerencie os grupos de WhatsApp das suas instâncias conectadas.
          </p>

          <div className="w-full md:w-72">
            <Select
              value={selectedInstanceId}
              onValueChange={setSelectedInstanceId}
              disabled={loadingInstances}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma instância..." />
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none" disabled>Nenhuma instância conectada</SelectItem>
                ) : (
                  instances.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Grupo</TableHead>
                <TableHead>Participantes</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!selectedInstanceId ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-16">
                    Selecione uma instância para carregar os grupos.
                  </TableCell>
                </TableRow>
              ) : loadingGroups ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-16">
                    Nenhum grupo encontrado nesta instância.
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((g: any, index: number) => {
                  const name = g.Name || g.subject || g.name || "Grupo sem nome";
                  const participantCount = g.ParticipantCount || g.participants?.length || g.size || "-";
                  const groupId = g.JID || g.id?._serialized || g.jid || g.id || index;

                  return (
                    <TableRow key={groupId}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{participantCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleGroupClick(g)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Ver Contatos
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog
        open={!!selectedGroup}
        onOpenChange={(open) => !open && setSelectedGroup(null)}
      >
        <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedGroup?.subject || selectedGroup?.name || "Detalhes do Grupo"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 mt-4">
            {selectedGroup?.loading || groupInfoMutation.isPending ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (selectedGroup?.Participants && selectedGroup.Participants.length > 0) || (selectedGroup?.participants && selectedGroup.participants.length > 0) ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-muted-foreground">
                    {(selectedGroup.Participants || selectedGroup.participants).length} participantes
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleImportContacts}
                    disabled={importing}
                  >
                    {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    Transformar em Leads
                  </Button>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-4 px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <div>Número</div>
                    <div>Nome</div>
                  </div>
                  {(selectedGroup.Participants || selectedGroup.participants).map((p: any, idx: number) => {
                    // API returns participants as objects or strings
                    const jid = typeof p === 'string' ? p : p.PhoneNumber || p.JID || p.id || p.jid;
                    const phone = jid?.split('@')[0];
                    const name = typeof p === 'object' ? p.DisplayName || p.ContactName || p.name || "" : "";
                    const isAdmin = p.IsAdmin || p.IsSuperAdmin || p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin;
                    
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-4 items-center p-2.5 bg-muted/40 rounded-lg border border-border/50 hover:bg-muted/60 transition-colors">
                        <div className="font-mono text-sm flex items-center gap-2">
                          {phone || "Desconhecido"}
                          {isAdmin && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
                              Admin
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate" title={name}>
                          {name || ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum participante encontrado ou formato de resposta não suportado.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unitModalOpen} onOpenChange={setUnitModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Selecionar Unidade</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Para qual unidade deseja enviar os leads deste grupo?
            </p>
            <div className="flex flex-col gap-2">
              <Select
                value={selectedUnitId}
                onValueChange={setSelectedUnitId}
                disabled={loadingUnits}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma unidade..." />
                </SelectTrigger>
                <SelectContent>
                  {units.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhuma unidade cadastrada</SelectItem>
                  ) : (
                    units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setUnitModalOpen(false)} disabled={importing}>
                Cancelar
              </Button>
              <Button onClick={confirmImport} disabled={importing || !selectedUnitId}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirmar Importação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
