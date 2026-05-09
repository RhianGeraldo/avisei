import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

type SettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

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

function SettingsPage() {
  const { roles, companyId } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isCompanyAdmin = roles.includes("company_admin");
  const canEditIntegrations = isSuper;
  const canEditCompany = isSuper || isCompanyAdmin;
  const qc = useQueryClient();

  // Empresa do usuário (resolve auto se não houver vínculo)
  const { data: company, isLoading: loadingCompany } = useQuery<CompanyRow | null>({
    queryKey: ["my-company", companyId],
    queryFn: async () => {
      try {
        const id = await resolveCompanyId(companyId);
        const { data } = await supabase.from("companies").select("*").eq("id", id).maybeSingle();
        return data;
      } catch {
        return null;
      }
    },
  });

  const [companyName, setCompanyName] = useState("");
  const [companyDocument, setCompanyDocument] = useState("");
  const [companyActive, setCompanyActive] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    setCompanyName(company?.name ?? "");
    setCompanyDocument(company?.document ?? "");
    setCompanyActive(company?.active ?? true);
  }, [company?.id, company?.name, company?.document, company?.active]);

  const onSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    if (!companyName.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    setSavingCompany(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: companyName.trim(),
        document: companyDocument.trim() || null,
        active: companyActive,
      })
      .eq("id", company.id);
    setSavingCompany(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Empresa atualizada");
    qc.invalidateQueries({ queryKey: ["my-company", companyId] });
  };

  // Integrações globais
  const { data: settings, isLoading: loadingSettings } = useQuery<SettingsRow | null>({
    queryKey: ["app-settings"],
    enabled: isSuper,
    queryFn: async () => {
      // Busca apenas o que garantidamente existe primeiro
      const { data, error } = await supabase
        .from("app_settings")
        .select("id, belle_base_url, evogo_url, evogo_admin_token")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;

      // Tenta buscar o proxy separadamente
      try {
        const { data: proxyData } = await supabase
          .from("app_settings")
          .select("evogo_proxy")
          .eq("id", true)
          .maybeSingle();
        if (proxyData) {
          return { ...data, evogo_proxy: proxyData.evogo_proxy } as SettingsRow;
        }
      } catch (e) {
        console.warn("evogo_proxy column not found");
      }

      return data as SettingsRow;
    },
  });

  const [belleBaseUrl, setBelleBaseUrl] = useState("");
  const [evogoUrl, setEvogoUrl] = useState("");
  const [evogoAdminToken, setEvogoAdminToken] = useState("");
  const [evogoProxy, setEvogoProxy] = useState("");
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  useEffect(() => {
    setBelleBaseUrl(settings?.belle_base_url ?? "");
    setEvogoUrl(settings?.evogo_url ?? "");
    setEvogoProxy(settings?.evogo_proxy ?? "");
    setEvogoAdminToken("");
  }, [settings?.belle_base_url, settings?.evogo_url, settings?.evogo_proxy, settings?.evogo_admin_token]);

  const onSubmitIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIntegrations(true);
    const tokenInput = evogoAdminToken.trim();
    const payload: any = {
      belle_base_url: belleBaseUrl.trim() || null,
      evogo_url: evogoUrl.trim() || null,
    };
    if (tokenInput) payload.evogo_admin_token = tokenInput;
    if (evogoProxy.trim()) payload.evogo_proxy = evogoProxy.trim();

    try {
      const { error } = await supabase.from("app_settings").update(payload).eq("id", true);
      if (error) {
        if (error.message.includes("evogo_proxy")) {
          // Tenta salvar sem o proxy
          delete payload.evogo_proxy;
          const { error: error2 } = await supabase
            .from("app_settings")
            .update(payload)
            .eq("id", true);
          if (error2) throw error2;
          toast.warning(
            "Configurações salvas, mas o Proxy não pôde ser gravado (coluna inexistente no banco).",
          );
        } else {
          throw error;
        }
      } else {
        toast.success("Configurações salvas");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingIntegrations(false);
      setEvogoAdminToken("");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    }
  };

  return (
    <AppLayout title="Configurações">
      <div className="max-w-2xl space-y-4">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>
              Dados da sua empresa. As unidades, instâncias e mensagens ficam sob este vínculo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitCompany} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nome</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Nome da empresa"
                  disabled={!canEditCompany || loadingCompany}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyDocument">CNPJ / CPF</Label>
                <Input
                  id="companyDocument"
                  value={companyDocument}
                  onChange={(e) => setCompanyDocument(e.target.value)}
                  placeholder="Documento (opcional)"
                  disabled={!canEditCompany || loadingCompany}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="companyActive" className="font-normal">
                  Empresa ativa
                </Label>
                <Switch
                  id="companyActive"
                  checked={companyActive}
                  onCheckedChange={setCompanyActive}
                  disabled={!canEditCompany || loadingCompany}
                />
              </div>
              {canEditCompany ? (
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingCompany || loadingCompany || !company}>
                    {savingCompany ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Apenas administradores da empresa podem alterar estes dados.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {isSuper && (
          <Card className="glass">
            <CardHeader>
              <CardTitle>Integrações</CardTitle>
              <CardDescription>
                URLs base das integrações Belle Software e Evogo. Configuração global do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitIntegrations} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="belle_base_url">URL base do Belle</Label>
                  <Input
                    id="belle_base_url"
                    value={belleBaseUrl}
                    onChange={(e) => setBelleBaseUrl(e.target.value)}
                    placeholder="https://api.bellesoftware.com.br"
                    disabled={!canEditIntegrations || loadingSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evogo_url">URL do Evogo</Label>
                  <Input
                    id="evogo_url"
                    value={evogoUrl}
                    onChange={(e) => setEvogoUrl(e.target.value)}
                    placeholder="https://evogo.suaempresa.com"
                    disabled={!canEditIntegrations || loadingSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evogo_admin_token">Admin token do Evogo</Label>
                  <Input
                    id="evogo_admin_token"
                    type="password"
                    autoComplete="off"
                    value={evogoAdminToken}
                    onChange={(e) => setEvogoAdminToken(e.target.value)}
                    placeholder={
                      settings?.evogo_admin_token
                        ? "•••••• (deixe em branco para manter)"
                        : "Token global usado para criar/listar/excluir instâncias"
                    }
                    disabled={!canEditIntegrations || loadingSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evogo_proxy">Proxy do Evogo (Opcional)</Label>
                  <Input
                    id="evogo_proxy"
                    value={evogoProxy}
                    onChange={(e) => setEvogoProxy(e.target.value)}
                    placeholder="ex: http://usuario:senha@ip-brasileiro:porta"
                    disabled={!canEditIntegrations || loadingSettings}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Recomendado usar proxy brasileiro para evitar bloqueios e confirmações de localidade no WhatsApp.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingIntegrations || loadingSettings}>
                    {savingIntegrations ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
