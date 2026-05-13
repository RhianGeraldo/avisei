"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Plus, Building2, Pencil, Trash2, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Unit = {
  id: string;
  company_id: string;
  name: string;
  belle_token: string | null;
  belle_base_url: string | null;
  belle_cod_estab: string | null;
  active: boolean;
};

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
    .insert({ name: "Padrão" })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar empresa padrão: ${error.message}`);
  return created.id;
}

export default function UnitsPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").order("name");
      if (error) throw error;
      return data as Unit[];
    },
  });

  const onSubmit = async (form: FormData) => {
    const tokenInput = String(form.get("belle_token") ?? "").trim();
    const codEstabInput = String(form.get("belle_cod_estab") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      toast.error("Nome obrigatório");
      return;
    }

    let resolvedCompanyId: string;
    try {
      resolvedCompanyId = editing?.company_id ?? (await resolveCompanyId(companyId));
    } catch (err) {
      toast.error("Falha ao resolver empresa");
      return;
    }

    const base = {
      company_id: resolvedCompanyId,
      name,
      active: form.get("active") === "on",
      belle_cod_estab: codEstabInput || null,
    };

    const res = editing
      ? await supabase.from("units").update({ ...base, ...(tokenInput ? { belle_token: tokenInput } : {}) }).eq("id", editing.id)
      : await supabase.from("units").insert({ ...base, belle_token: tokenInput || null });

    if (res.error) {
      toast.error(res.error.message);
    } else {
      toast.success(editing ? "Atualizada" : "Criada");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["units"] });
    }
  };

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["units"] });
    }
  };

  return (
    <AppLayout title="Unidades">
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground">Unidades cadastradas no Belle Software.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Nova unidade</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
            <form action={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da unidade</Label>
                <Input name="name" required defaultValue={editing?.name} />
              </div>
              <div className="space-y-2">
                <Label>Token Belle</Label>
                <Input name="belle_token" type="password" placeholder="••••••" />
              </div>
              <div className="space-y-2">
                <Label>Código do estabelecimento</Label>
                <Input name="belle_cod_estab" defaultValue={editing?.belle_cod_estab ?? ""} />
              </div>
              <div className="flex items-center gap-2">
                <Switch name="active" defaultChecked={editing?.active ?? true} id="active" />
                <Label htmlFor="active">Ativa</Label>
              </div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3}>Carregando...</TableCell></TableRow>
            ) : units.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-16">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <Building2 className="h-12 w-12" />
                    <p>Nenhuma unidade cadastrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : units.map((u) => (
              <TableRow key={u.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/units/${u.id}`)}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Link href={`/units/${u.id}`} className="inline-flex items-center justify-center p-2 hover:bg-muted rounded"><ExternalLink className="h-4 w-4" /></Link>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <ConfirmDialog trigger={<Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button>} title="Excluir?" onConfirm={() => onDelete(u.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppLayout>
  );
}
