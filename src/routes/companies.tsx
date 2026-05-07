import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/companies")({ component: CompaniesPage });

type Company = { id: string; name: string; document: string | null; active: boolean; created_at: string };

function CompaniesPage() {
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Company[];
    },
  });

  const onSubmit = async (form: FormData) => {
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      document: String(form.get("document") ?? "").trim() || null,
      active: form.get("active") === "on",
    };
    if (!payload.name) { toast.error("Nome obrigatório"); return; }

    const res = editing
      ? await supabase.from("companies").update(payload).eq("id", editing.id)
      : await supabase.from("companies").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "Empresa atualizada" : "Empresa criada"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["companies"] }); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir essa empresa? Todos os dados associados serão perdidos.")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluída"); qc.invalidateQueries({ queryKey: ["companies"] }); }
  };

  if (!isSuper) {
    return <AppLayout title="Empresas"><Card className="p-6 glass">Acesso restrito a super admins.</Card></AppLayout>;
  }

  return (
    <AppLayout title="Empresas">
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground">Empresas/clientes da plataforma.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nova empresa</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle></DialogHeader>
            <form action={onSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Nome</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div className="space-y-2"><Label>CNPJ</Label><Input name="document" defaultValue={editing?.document ?? ""} /></div>
              <div className="flex items-center gap-2"><Switch name="active" defaultChecked={editing?.active ?? true} id="active" /><Label htmlFor="active">Ativa</Label></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Status</TableHead><TableHead className="w-32 text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4}>Carregando...</TableCell></TableRow>
              : companies.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma empresa cadastrada</TableCell></TableRow>
              : companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.document ?? "—"}</TableCell>
                  <TableCell>{c.active ? <Badge variant="default">Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
