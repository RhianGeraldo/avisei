import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/units")({ component: UnitsPage });

type Unit = { id: string; company_id: string; name: string; belle_token: string | null; belle_base_url: string | null; active: boolean };

function UnitsPage() {
  const { roles, companyId } = useAuth();
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").order("name");
      if (error) throw error;
      return data as Unit[];
    },
  });

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

  const onSubmit = async (form: FormData) => {
    const company_id = isSuper ? String(form.get("company_id") ?? "") : companyId;
    if (!company_id) { toast.error("Empresa obrigatória"); return; }
    const payload = {
      company_id,
      name: String(form.get("name") ?? "").trim(),
      belle_token: String(form.get("belle_token") ?? "").trim() || null,
      belle_base_url: String(form.get("belle_base_url") ?? "").trim() || null,
      active: form.get("active") === "on",
    };
    if (!payload.name) { toast.error("Nome obrigatório"); return; }

    const res = editing
      ? await supabase.from("units").update(payload).eq("id", editing.id)
      : await supabase.from("units").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "Atualizada" : "Criada"); setOpen(false); setEditing(null); setSelectedCompany(""); qc.invalidateQueries({ queryKey: ["units"] }); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir esta unidade?")) return;
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluída"); qc.invalidateQueries({ queryKey: ["units"] }); }
  };

  return (
    <AppLayout title="Unidades">
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground">Unidades cadastradas no Belle Software.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setSelectedCompany(""); } }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nova unidade</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
            <form action={onSubmit} className="space-y-4">
              {isSuper && (
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select name="company_id" defaultValue={editing?.company_id ?? selectedCompany} onValueChange={setSelectedCompany}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="company_id" value={editing?.company_id ?? selectedCompany} />
                </div>
              )}
              <div className="space-y-2"><Label>Nome da unidade</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div className="space-y-2"><Label>Token Belle</Label><Input name="belle_token" defaultValue={editing?.belle_token ?? ""} placeholder="Token de acesso à API do Belle" /></div>
              <div className="space-y-2"><Label>URL base Belle</Label><Input name="belle_base_url" defaultValue={editing?.belle_base_url ?? ""} placeholder="https://api.bellesoftware.com.br" /></div>
              <div className="flex items-center gap-2"><Switch name="active" defaultChecked={editing?.active ?? true} id="active" /><Label htmlFor="active">Ativa</Label></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead>{isSuper && <TableHead>Empresa</TableHead>}<TableHead>Token Belle</TableHead><TableHead>Status</TableHead><TableHead className="w-40 text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5}>Carregando...</TableCell></TableRow>
              : units.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma unidade cadastrada</TableCell></TableRow>
              : units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  {isSuper && <TableCell className="text-muted-foreground">{companyMap[u.company_id] ?? "—"}</TableCell>}
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.belle_token ? `${u.belle_token.slice(0, 8)}…` : "—"}</TableCell>
                  <TableCell>{u.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" asChild><Link to="/units/$unitId" params={{ unitId: u.id }}><ExternalLink className="h-4 w-4" /></Link></Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(u.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
