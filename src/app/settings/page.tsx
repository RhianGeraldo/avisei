"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Bot, Flame, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

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

export default function SettingsPage() {
  const { roles, companyId } = useAuth();
  const isSuper = roles.includes("super_admin");
  const isCompanyAdmin = roles.includes("company_admin");
  const canEditIntegrations = isSuper;
  const canEditCompany = isSuper || isCompanyAdmin;
  const qc = useQueryClient();

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
  const [apiToken, setApiToken] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [warmerPrompt, setWarmerPrompt] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  useEffect(() => {
    setCompanyName(company?.name ?? "");
    setCompanyDocument(company?.document ?? "");
    setCompanyActive(company?.active ?? true);
    setApiToken((company as any)?.api_token ?? "");
    setOpenaiApiKey((company as any)?.openai_api_key ?? "");
    setWarmerPrompt((company as any)?.warmer_prompt ?? "");
  }, [company]);

  const onSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSavingCompany(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: companyName.trim(),
        document: companyDocument.trim() || null,
        active: companyActive,
        api_token: apiToken || null,
        openai_api_key: openaiApiKey.trim() || null,
        warmer_prompt: warmerPrompt.trim() || null,
      })
      .eq("id", company.id);
    setSavingCompany(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Empresa atualizada");
      qc.invalidateQueries({ queryKey: ["my-company", companyId] });
    }
  };

  const { data: settings, isLoading: loadingSettings } = useQuery<SettingsRow | null>({
    queryKey: ["app-settings"],
    enabled: isSuper,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data as SettingsRow;
    },
  });

  const [belleBaseUrl, setBelleBaseUrl] = useState("");
  const [evogoUrl, setEvogoUrl] = useState("");
  const [evogoAdminToken, setEvogoAdminToken] = useState("");
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  useEffect(() => {
    setBelleBaseUrl(settings?.belle_base_url ?? "");
    setEvogoUrl(settings?.evogo_url ?? "");
  }, [settings]);

  const onSubmitIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIntegrations(true);
    const payload: any = {
      belle_base_url: belleBaseUrl.trim() || null,
      evogo_url: evogoUrl.trim() || null,
    };
    if (evogoAdminToken.trim()) payload.evogo_admin_token = evogoAdminToken.trim();

    const { error } = await supabase.from("app_settings").update(payload).eq("id", true);
    setSavingIntegrations(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Integrações salvas");
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
            <CardDescription>Dados da sua empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitCompany} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!canEditCompany} />
              </div>
              <div className="space-y-2">
                <Label>Documento</Label>
                <Input value={companyDocument} onChange={(e) => setCompanyDocument(e.target.value)} disabled={!canEditCompany} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch checked={companyActive} onCheckedChange={setCompanyActive} disabled={!canEditCompany} />
              </div>
              <div className="space-y-2">
                <Label>Token da API Externa</Label>
                <div className="flex gap-2">
                  <Input 
                    value={apiToken} 
                    readOnly 
                    placeholder="Nenhum token gerado" 
                    className="font-mono text-sm"
                  />
                  {canEditCompany && (
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setApiToken(`avisei_sk_${crypto.randomUUID().replace(/-/g, "")}`)}
                    >
                      Gerar Novo
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Use este token para autenticar requisições de sistemas parceiros.</p>
              </div>
              {canEditCompany && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingCompany}>Salvar</Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <div>
                <CardTitle>Inteligência Artificial (Aquecedor de Chips)</CardTitle>
                <CardDescription>
                  Configure a chave da API para respostas dinâmicas e conversas humanizadas no aquecedor de números.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitCompany} className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  Chave de API OpenAI (ou compatível)
                </Label>
                <Input
                  type="password"
                  placeholder="sk-proj-..."
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  disabled={!canEditCompany}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Suporta chaves padrão OpenAI (modelo gpt-4o-mini). Caso não configure, o sistema usará automaticamente a contingência nativa com centenas de diálogos realistas brasileiros.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    Prompt Base do Aquecedor (Opcional)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary h-7 px-2"
                    onClick={() =>
                      setWarmerPrompt(
                        `Você é uma pessoa comum brasileira conversando no WhatsApp com um amigo ou conhecido de trabalho.\nREGRAS OBRIGATÓRIAS:\n- Responda em português brasileiro coloquial, com gírias leves (ex: "mano", "beleza", "tranquilo", "show", "kkk"), estilo mensagem de WhatsApp real.\n- Seja SUPER BREVE: no máximo 1 ou 2 frases curtas. Não escreva textos longos nem parágrafos explicativos.\n- Nunca se identifique como inteligência artificial, robô ou assistente.`
                      )
                    }
                  >
                    Usar padrão recomendado
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  placeholder="Instruções personalizadas de personalidade para a IA durante o aquecimento dos números..."
                  value={warmerPrompt}
                  onChange={(e) => setWarmerPrompt(e.target.value)}
                  disabled={!canEditCompany}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  A IA utiliza controle anti-looping rigoroso, encerrando a conversa educadamente a partir do 4º turno para evitar repetições contínuas.
                </p>
              </div>

              {canEditCompany && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingCompany}>
                    Salvar Configurações de IA
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {isSuper && (
          <Card className="glass">
            <CardHeader>
              <CardTitle>Integrações</CardTitle>
              <CardDescription>Configurações globais de API.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmitIntegrations} className="space-y-4">
                <div className="space-y-2">
                  <Label>Belle API URL</Label>
                  <Input value={belleBaseUrl} onChange={(e) => setBelleBaseUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Evogo API URL</Label>
                  <Input value={evogoUrl} onChange={(e) => setEvogoUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Evogo Admin Token</Label>
                  <Input type="password" value={evogoAdminToken} onChange={(e) => setEvogoAdminToken(e.target.value)} placeholder="Deixe em branco para manter" />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingIntegrations}>Salvar Integrações</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
