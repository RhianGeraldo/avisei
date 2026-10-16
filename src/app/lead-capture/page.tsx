"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Copy, Link2, Loader2, Plus, Trash2 } from "lucide-react";

const GENERAL = "geral";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  awaiting_connection: {
    label: "Aguardando QR",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  extracting: { label: "Extraindo", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  completed: {
    label: "Concluído",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  failed: {
    label: "Falhou",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  expired: { label: "Expirado", className: "bg-muted text-muted-foreground" },
};

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default function LeadCapturePage() {
  const qc = useQueryClient();
  const { companyId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState<string>(GENERAL);
  const [saving, setSaving] = useState(false);

  const { data: units = [] } = useQuery({
    queryKey: ["all-units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: links = [], isLoading: loadingLinks } = useQuery({
    queryKey: ["lead-capture-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_capture_links")
        .select("id, name, token, active, unit_id, created_at, units(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["lead-capture-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_capture_sessions")
        .select(
          "id, link_id, unit_id, person_name, status, groups_total, groups_done, groups_failed, leads_inserted, leads_updated, skipped_without_phone, error, created_at, units(name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    // Atualiza ao vivo enquanto houver captura em andamento
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (s: any) => s.status === "awaiting_connection" || s.status === "extracting",
      )
        ? 5000
        : false,
  });

  const linkName = (id: string) => links.find((l: any) => l.id === id)?.name ?? "—";
  const linkUrl = (token: string) => `${window.location.origin}/conectar/${token}`;

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(linkUrl(token));
    toast.success("Link copiado!");
  };

  const createLink = async () => {
    if (!companyId) {
      toast.error("Sua conta não está vinculada a nenhuma empresa.");
      return;
    }
    if (!name.trim()) {
      toast.error("Informe um nome para o link.");
      return;
    }
    setSaving(true);
    const token = generateToken();
    const { error } = await supabase.from("lead_capture_links").insert({
      company_id: companyId,
      unit_id: unitId === GENERAL ? null : unitId,
      name: name.trim(),
      token,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Falha ao criar link: " + error.message);
      return;
    }
    toast.success("Link criado!");
    copyLink(token).catch(() => {});
    setOpen(false);
    setName("");
    setUnitId(GENERAL);
    qc.invalidateQueries({ queryKey: ["lead-capture-links"] });
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("lead_capture_links")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["lead-capture-links"] });
  };

  const deleteLink = async (id: string) => {
    const { error } = await supabase.from("lead_capture_links").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Link excluído");
    qc.invalidateQueries({ queryKey: ["lead-capture-links"] });
    qc.invalidateQueries({ queryKey: ["lead-capture-sessions"] });
  };

  return (
    <AppLayout title="Captura de Leads">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <p className="text-muted-foreground max-w-2xl">
            Gere um link e envie para a pessoa. Ela informa o nome, escaneia o QR Code e o sistema
            importa todos os participantes dos grupos dela para a Base de Leads. Depois, o WhatsApp
            dela é desconectado automaticamente.
          </p>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo link
          </Button>
        </div>

        <Card className="glass">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingLinks ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    Nenhum link criado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                links.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        {l.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {l.units?.name ?? <span className="text-muted-foreground">Geral</span>}
                    </TableCell>
                    <TableCell>
                      <Switch checked={l.active} onCheckedChange={(v) => toggleActive(l.id, v)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyLink(l.token)}
                        disabled={!l.active}
                      >
                        <Copy className="h-4 w-4 mr-2" /> Copiar link
                      </Button>
                      <ConfirmDialog
                        title="Excluir link?"
                        description="O link deixará de funcionar e o histórico de capturas dele será removido. Os leads já importados permanecem."
                        onConfirm={() => deleteLink(l.id)}
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Capturas recentes</h2>
          <Card className="glass">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaboradora</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Grupos</TableHead>
                  <TableHead>Novos leads</TableHead>
                  <TableHead>Já existentes</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      Nenhuma captura realizada ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s: any) => {
                    const st = STATUS_LABEL[s.status] ?? { label: s.status, className: "" };
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.person_name}</TableCell>
                        <TableCell>
                          {s.units?.name ? (
                            <Badge variant="outline">{s.units.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Geral</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {linkName(s.link_id)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={st.className}
                            title={s.error ?? undefined}
                          >
                            {s.status === "extracting" && (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            )}
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.groups_done}/{s.groups_total}
                          {s.groups_failed > 0 && (
                            <span className="text-destructive text-xs ml-1">
                              ({s.groups_failed} falhas)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-primary">
                          {s.leads_inserted}
                        </TableCell>
                        <TableCell>{s.leads_updated}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Novo link de captura</DialogTitle>
            <DialogDescription>
              Os leads capturados por este link serão vinculados à unidade escolhida.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="link-name">Nome do link</Label>
              <Input
                id="link-name"
                placeholder="Ex: Parceiros - Unidade Centro"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GENERAL}>Geral (sem unidade)</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createLink} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar e copiar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
