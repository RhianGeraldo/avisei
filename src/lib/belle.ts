"use server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { substituirVariaveis } from "./utils";

// Função para formatar data de YYYY-MM-DD para DD/MM/YYYY (exigência do Belle API)
function formatDateToBelle(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

// Função para formatar data de YYYY-MM-DD para DD/MM/YYYY (exibição na mensagem)
function formatDateToDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

async function loadBelleBaseUrl(): Promise<string> {
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
  unitId: string,
): Promise<{ token: string; codEstab: string }> {
  const { data, error } = await supabaseAdmin
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
    throw new Error(`Belle ${res.status}: ${text.slice(0, 500)}`);
  }
  return parsed as T;
}

function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// BUSCA DE AGENDAMENTOS
export async function fetchBelleAgendamentos({ data }: { data: any }) {
  const url = await loadBelleBaseUrl();
  const { token, codEstab } = await loadUnitBelleConfig(data.unitId);

  const params: Record<string, string> = {
    codEstab,
    dtInicio: formatDateToBelle(data.dtInicio),
    dtFim: formatDateToBelle(data.dtFim),
    ...(data.status ? { status: data.status } : {}),
    ...(data.tipoAgendamento ? { tipoAgendamento: data.tipoAgendamento } : {}),
  };

  const raw = await belleFetch<any[]>("/agendamentos", { url, token, params });
  const lista = Array.isArray(raw) ? raw : [];

  // Agrupar por cliente para evitar duplicados
  const grupos = new Map<string, any[]>();
  lista.forEach(a => {
    const cod = a.cliente?.cod;
    if (!cod) return;
    if (!grupos.has(cod)) grupos.set(cod, []);
    grupos.get(cod)!.push(a);
  });

  const codigosUnicos = Array.from(grupos.keys());
  const celulares = new Map<string, string>();

  console.log(`[belle] Buscando celulares para ${codigosUnicos.length} clientes...`);

  // Buscar celulares em lotes maiores (15 por vez) para ganhar velocidade
  const BATCH_SIZE = 15;
  for (let i = 0; i < codigosUnicos.length; i += BATCH_SIZE) {
    const slice = codigosUnicos.slice(i, i + BATCH_SIZE);
    console.log(`[belle] Processando lote ${Math.floor(i/BATCH_SIZE) + 1} de ${Math.ceil(codigosUnicos.length/BATCH_SIZE)}...`);
    
    await Promise.all(slice.map(async (cod) => {
      try {
        const cliente = await belleFetch<any>("/cliente/listar", { url, token, params: { codEstab, id: cod } });
        const celular = cliente?.celular || cliente?.celular2 || cliente?.telefone || "";
        if (celular) celulares.set(cod, celular);
      } catch (err: any) {
        console.warn(`[belle] Falha ao buscar cliente ${cod}:`, err.message);
      }
    }));
  }

  console.log(`[belle] Busca de celulares finalizada. Total com celular: ${celulares.size}`);

  const items = [];
  for (const [cod, agendamentos] of grupos.entries()) {
    // Ordenar por hora e pegar o primeiro
    const ordenados = [...agendamentos].sort((a, b) => (a.hrConsulta || "").localeCompare(b.hrConsulta || ""));
    const principal = ordenados[0];
    
    // Unificar todos os serviços
    const todosServicos = agendamentos.flatMap(a => a.servicos || []).map(s => s.nome).filter(Boolean);
    const servicosUnicos = Array.from(new Set(todosServicos))
      .map(s => `- ${s}`)
      .join("\n");

    items.push({
      ...principal,
      id: principal.idAgendamento || principal.cod,
      number: celulares.get(cod) || "",
      vars: {
        cliente_nome: toTitleCase(principal.cliente?.nome),
        cliente_p_nome: toTitleCase(principal.cliente?.nome?.split(" ")[0]),
        data: formatDateToDisplay(principal.dtAgenda),
        hora: principal.hrConsulta,
        profissional: principal.profNome,
        servicos: servicosUnicos,
        status: principal.status || "",
        tipo: principal.tipo || "",
        observacao: principal.observacao || "",
      }
    });
  }

  return { items };
}

// BUSCA DE COBRANÇAS (CONTAS A RECEBER)
export async function fetchBelleCobrancas({ data }: { data: any }) {
  const url = await loadBelleBaseUrl();
  const { token, codEstab } = await loadUnitBelleConfig(data.unitId);

  const params: Record<string, string> = {
    estab: codEstab,
    dtInicio: formatDateToBelle(data.dtInicio),
    dtFim: formatDateToBelle(data.dtFim),
    tipoData: "vencimento",
  };

  const raw = await belleFetch<any[]>("/contas_receber", { url, token, params });
  const lista = (Array.isArray(raw) ? raw : []).filter(c => c.confirmado === "N");

  const codigosUnicos = Array.from(new Set(lista.map((c) => c.cod_cliente).filter(Boolean)));
  const celulares = new Map<string, string>();

  console.log(`[belle] Buscando celulares para ${codigosUnicos.length} clientes de cobrança...`);

  for (let i = 0; i < codigosUnicos.length; i += 15) {
    const slice = codigosUnicos.slice(i, i + 15);
    console.log(`[belle] Processando lote cobrança ${Math.floor(i/15) + 1}...`);
    await Promise.all(slice.map(async (cod) => {
      try {
        const cliente = await belleFetch<any>("/cliente/listar", { url, token, params: { codEstab, id: cod } });
        const celular = cliente?.celular || cliente?.celular2 || cliente?.telefone || "";
        if (celular) celulares.set(cod, celular);
      } catch (err: any) {
        console.warn(`[belle] Falha ao buscar cliente cobrança ${cod}:`, err.message);
      }
    }));
  }

  console.log(`[belle] Busca de cobranças finalizada. Total com celular: ${celulares.size}`);

  return {
    items: lista.map((c) => ({
      ...c,
      id: c.cod_movimento,
      number: celulares.get(c.cod_cliente) || "",
      vars: {
        cliente_nome: toTitleCase(c.nome_cliente),
        cliente_p_nome: toTitleCase(c.nome_cliente?.split(" ")[0]),
        valor: parseFloat(c.valor_bruto || "0").toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        vencimento: formatDateToDisplay(c.dt_vencimento),
        observacao: c.observacao || "",
        forma_pagamento: c.nome_forma_pagamento || "",
        id_venda: c.id_venda_relacionada || "",
      }
    }))
  };
}

// ENFILEIRAMENTO GENÉRICO
export async function enqueueBelleItems({ data }: { data: any }) {
  const { data: templates } = await supabaseAdmin
    .from("messages")
    .select("*")
    .in("id", data.items.map((i: any) => i.messageId));
  
  const tplMap = new Map(templates?.map((t) => [t.id, t]) ?? []);
  const { data: unit } = await supabaseAdmin.from("units").select("name").eq("id", data.unitId).maybeSingle();

  const interval = data.interval || 30;
  const now = new Date();

  const rows = data.items.map((item: any, index: number) => {
    const tpl = tplMap.get(item.messageId);
    if (!tpl) return null;

    const text = substituirVariaveis(tpl.template, {
      ...item.vars,
      unidade: unit?.name ?? "",
    });

    const cleanNumber = item.number.replace(/\D/g, "");
    if (!cleanNumber) return null;

    const scheduledAt = new Date(now.getTime() + (index * interval * 1000) + (Math.random() * 2000));

    return {
      unit_id: data.unitId,
      message_id: item.messageId,
      instance_id: data.instanceId,
      number: cleanNumber,
      cliente_nome: item.vars?.cliente_nome || null,
      text,
      status: "pending",
      scheduled_at: scheduledAt.toISOString(),
      company_id: tpl.company_id,
    };
  }).filter(Boolean);

  if (rows.length === 0) return { success: true, count: 0 };

  const { error } = await supabaseAdmin.from("send_queue").insert(rows);
  if (error) throw error;
  
  return { success: true, count: rows.length };
}
