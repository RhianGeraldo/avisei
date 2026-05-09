import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseUserClient = import("@supabase/supabase-js").SupabaseClient<
  import("@/integrations/supabase/types").Database
>;

async function loadBelleBaseUrl(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("belle_base_url")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler configurações: ${error.message}`);
  if (!data?.belle_base_url) {
    throw new Error("URL base do Belle não configurada em /settings.");
  }
  return data.belle_base_url.replace(/\/+$/, "");
}

async function loadUnitBelleConfig(
  supabase: SupabaseUserClient,
  unitId: string,
): Promise<{ token: string; codEstab: string }> {
  const { data, error } = await supabase
    .from("units")
    .select("belle_token, belle_cod_estab")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Unidade não encontrada ou sem permissão.");
  if (!data.belle_token) throw new Error("Token do Belle não configurado nesta unidade.");
  if (!data.belle_cod_estab) {
    throw new Error("Código do estabelecimento (codEstab) não configurado nesta unidade.");
  }
  return { token: data.belle_token, codEstab: data.belle_cod_estab };
}

async function belleFetch<T = unknown>(
  path: string,
  opts: { url: string; token: string; params?: Record<string, string> },
): Promise<T> {
  const qs = opts.params ? "?" + new URLSearchParams(opts.params).toString() : "";
  const res = await fetch(`${opts.url}${path}${qs}`, {
    method: "GET",
    headers: {
      Authorization: opts.token,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const detail =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : typeof parsed === "string"
          ? parsed.slice(0, 500)
          : `HTTP ${res.status}`;
    console.error(`[belle] GET ${path} -> ${res.status}`, parsed ?? text);
    throw new Error(`Belle ${res.status}: ${detail}`);
  }
  return parsed as T;
}

type BelleAgendamentoRaw = {
  codConsulta: number;
  dtAgenda: string;
  hrConsulta: string;
  status: string;
  tipo: string;
  codEstab: string;
  tipo_obs?: string;
  observacao?: string;
  cliente: { cod: string; nome: string };
  prof: { cod: string; nome: string };
  sala?: { cod: string; nome: string };
  servicos: Array<{ cod: string; nome: string }>;
};

type BelleCliente = {
  codigo: number;
  nome: string;
  celular?: string;
  celular2?: string;
  telefone?: string;
};

export type AgendamentoVars = {
  cliente_nome: string;
  cliente_p_nome: string;
  cliente_cod: string;
  data: string;
  hora: string;
  profissional: string;
  servicos: string;
  unidade?: string;
};

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function substituirVariaveis(template: string, vars: AgendamentoVars): string {
  return template.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (match, key) => {
    const v = (vars as Record<string, string | undefined>)[key];
    return v ?? match;
  });
}

export type BelleAgendamentoEnriquecido = {
  codConsulta: number;
  dtAgenda: string;
  hrConsulta: string;
  status: string;
  tipo: string;
  observacao: string | null;
  cliente: {
    cod: string;
    nome: string;
    celular: string | null;
  };
  prof: { cod: string; nome: string };
  servicos: Array<{ cod: string; nome: string }>;
};

const fetchAgendamentosInput = z.object({
  unitId: z.string().uuid(),
  // Formato Belle: dd/mm/yyyy
  dtInicio: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Use o formato dd/mm/yyyy"),
  dtFim: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Use o formato dd/mm/yyyy"),
  hrInicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  hrFim: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  status: z.enum(["Marcado", "Confirmado", "Aguardando", "Em Andamento", "Antecipado"]).optional(),
  tipoAgendamento: z.enum(["Avaliação", "Serviço", "Consulta", "Retorno"]).optional(),
  codServico: z.number().int().optional(),
});

export const fetchBelleAgendamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fetchAgendamentosInput.parse(data))
  .handler(async ({ data, context }) => {
    const url = await loadBelleBaseUrl();
    const { token, codEstab } = await loadUnitBelleConfig(context.supabase, data.unitId);

    const params: Record<string, string> = {
      codEstab,
      dtInicio: data.dtInicio,
      dtFim: data.dtFim,
    };
    if (data.hrInicio) params.hrInicio = data.hrInicio;
    if (data.hrFim) params.hrFim = data.hrFim;
    if (data.status) params.status = data.status;
    if (data.tipoAgendamento) params.tipoAgendamento = data.tipoAgendamento;
    if (data.codServico !== undefined) params.codServico = String(data.codServico);

    const raw = await belleFetch<BelleAgendamentoRaw[]>("/agendamentos", {
      url,
      token,
      params,
    });
    const lista = Array.isArray(raw) ? raw : [];

    // Cliente fetch é caro — agrupa por código único e faz uma chamada por cliente.
    const codigosUnicos = Array.from(new Set(lista.map((a) => a.cliente?.cod).filter(Boolean)));
    const celulares = new Map<string, string>();

    // Concorrência limitada (5 simultâneos) para não estourar o Belle.
    const concurrency = 5;
    for (let i = 0; i < codigosUnicos.length; i += concurrency) {
      const slice = codigosUnicos.slice(i, i + concurrency);
      await Promise.all(
        slice.map(async (cod) => {
          try {
            const cliente = await belleFetch<BelleCliente>("/cliente/listar", {
              url,
              token,
              params: { codEstab, id: cod },
            });
            const celular = cliente?.celular || cliente?.celular2 || cliente?.telefone || "";
            if (celular) celulares.set(cod, celular);
          } catch (err) {
            console.warn(`[belle] falha buscando cliente ${cod}`, err);
          }
        }),
      );
    }

    const enriquecidos: BelleAgendamentoEnriquecido[] = lista.map((a) => ({
      codConsulta: a.codConsulta,
      dtAgenda: a.dtAgenda,
      hrConsulta: a.hrConsulta,
      status: a.status,
      tipo: a.tipo,
      observacao: a.observacao ?? null,
      cliente: {
        cod: a.cliente?.cod ?? "",
        nome: a.cliente?.nome ?? "",
        celular: celulares.get(a.cliente?.cod) ?? null,
      },
      prof: { cod: a.prof?.cod ?? "", nome: a.prof?.nome ?? "" },
      servicos: Array.isArray(a.servicos)
        ? a.servicos.map((s) => ({ cod: s.cod, nome: s.nome }))
        : [],
    }));

    return {
      total: enriquecidos.length,
      semCelular: enriquecidos.filter((e) => !e.cliente.celular).length,
      agendamentos: enriquecidos,
    };
  });

const enqueueItemSchema = z.object({
  codConsulta: z.number(),
  messageId: z.string().uuid(),
  number: z.string().min(8),
  cliente: z.object({ cod: z.string(), nome: z.string() }),
  dtAgenda: z.string(),
  hrConsulta: z.string(),
  profNome: z.string(),
  servicos: z.array(z.string()),
});

export const enqueueBelleAgendamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        unitId: z.string().uuid(),
        instanceId: z.string().uuid(),
        items: z.array(enqueueItemSchema).min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const messageIds = Array.from(new Set(data.items.map((i) => i.messageId)));
    const { data: templates, error: tplErr } = await context.supabase
      .from("messages")
      .select("id, template, unit_ids")
      .in("id", messageIds);
    if (tplErr) throw new Error(tplErr.message);

    const tplMap = new Map(templates?.map((t) => [t.id, t]) ?? []);

    // Carrega nome da unidade pra variável {{unidade}}.
    const { data: unit } = await context.supabase
      .from("units")
      .select("name")
      .eq("id", data.unitId)
      .maybeSingle();

    // Merge: cliente+data+template → uma única mensagem combinando horários/serviços/profissionais.
    type Item = (typeof data.items)[number];
    const groups = new Map<string, Item[]>();
    for (const item of data.items) {
      const key = `${item.cliente.cod}|${item.dtAgenda}|${item.messageId}`;
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    const merged = data.items.length - groups.size;

    const joinPt = (xs: string[]): string => {
      if (xs.length === 0) return "";
      if (xs.length === 1) return xs[0];
      if (xs.length === 2) return `${xs[0]} e ${xs[1]}`;
      return `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
    };

    const rows = Array.from(groups.values()).map((items) => {
      // Ordena por horário pra primeira ser a mais cedo.
      items.sort((a, b) => a.hrConsulta.localeCompare(b.hrConsulta));
      const first = items[0];
      const tpl = tplMap.get(first.messageId);
      if (!tpl) throw new Error(`Template ${first.messageId} não encontrado.`);
      // Se unit_ids está vazio é compartilhado; senão precisa conter a unidade.
      if (tpl.unit_ids.length > 0 && !tpl.unit_ids.includes(data.unitId)) {
        throw new Error("Template não disponível para esta unidade.");
      }

      const horarios = items.map((i) => i.hrConsulta);
      const servicos = Array.from(new Set(items.flatMap((i) => i.servicos)));
      const profissionais = Array.from(
        new Set(items.map((i) => i.profNome).filter((p): p is string => !!p)),
      );
      const codConsultas = items.map((i) => i.codConsulta);

      // Quando há mais de 1 serviço, formata como lista com "- " — o WhatsApp renderiza como bullets.
      const servicosFormatted =
        servicos.length > 1 ? servicos.map((s) => `- ${s}`).join("\n") : (servicos[0] ?? "");

      const text = substituirVariaveis(tpl.template, {
        cliente_nome: toTitleCase(first.cliente.nome),
        cliente_p_nome: toTitleCase(first.cliente.nome.trim().split(/\s+/)[0] || first.cliente.nome),
        cliente_cod: first.cliente.cod,
        data: first.dtAgenda,
        hora: joinPt(horarios),
        profissional: joinPt(profissionais),
        servicos: servicosFormatted,
        unidade: unit?.name ?? "",
      });

      return {
        unit_id: data.unitId,
        message_id: first.messageId,
        instance_id: data.instanceId,
        number: first.number,
        text,
        status: "pending" as const,
        cod_consulta: first.codConsulta,
        cliente_cod: first.cliente.cod,
        cliente_nome: toTitleCase(first.cliente.nome),
        agendamento_data: {
          dtAgenda: first.dtAgenda,
          hrConsulta: joinPt(horarios),
          profNome: joinPt(profissionais),
          servicos,
          codConsultas,
          quantidade: items.length,
        },
      };
    });

    const { error } = await context.supabase.from("send_queue").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length, merged };
  });
