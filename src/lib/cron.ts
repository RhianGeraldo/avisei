// Handler do CF Workers Cron Trigger.
// Roda a cada 5 min: lê cron_jobs ativos, identifica quais devem rodar agora
// (por horário Brasil + dia da semana + ainda não rodou hoje) e executa.
import { substituirVariaveis } from "./belle";

type SupabaseAdmin = Awaited<
  ReturnType<typeof import("@/integrations/supabase/client.server").supabaseAdmin.from>
>["from"] extends never
  ? never
  : import("@supabase/supabase-js").SupabaseClient<
      import("@/integrations/supabase/types").Database
    >;

const CRON_WINDOW_MINUTES = 5;

function getBrazilParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const wdName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(date);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday,
  };
}

function shouldRun(
  cron: { schedule_time: string; days_of_week: number[]; last_run_at: string | null },
  now: Date,
): boolean {
  const br = getBrazilParts(now);
  if (!cron.days_of_week.includes(br.weekday)) return false;

  const [hh, mm] = cron.schedule_time.split(":").map((n) => Number(n));
  const nowMinutes = br.hour * 60 + br.minute;
  const schedMinutes = hh * 60 + mm;
  const diff = nowMinutes - schedMinutes;
  if (diff < 0 || diff > CRON_WINDOW_MINUTES) return false;

  if (cron.last_run_at) {
    const last = getBrazilParts(new Date(cron.last_run_at));
    if (last.year === br.year && last.month === br.month && last.day === br.day) {
      return false;
    }
  }
  return true;
}

function toBelleDate(year: number, month: number, day: number): string {
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}/${mm}/${year}`;
}

// Aritmética de datas pura no calendário (sem envolver fuso/horas) —
// evita bugs como BR→UTC→BR perder 1 dia por causa do offset UTC-3.
function addDaysCalendar(
  year: number,
  month: number,
  day: number,
  daysToAdd: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

async function belleGet<T>(
  url: string,
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const qs = "?" + new URLSearchParams(params).toString();
  const res = await fetch(`${url}${path}${qs}`, {
    method: "GET",
    headers: { Authorization: token, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Belle ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : (null as T);
}

async function evogoSend(url: string, apikey: string, number: string, text: string): Promise<void> {
  const res = await fetch(`${url}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey },
    body: JSON.stringify({ number, text, delay: 0 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Evogo ${res.status}: ${t.slice(0, 300)}`);
  }
}

type CronContext = {
  cron: import("@/integrations/supabase/types").Database["public"]["Tables"]["cron_jobs"]["Row"];
  targetInstanceId: string | null;
  template: { id: string; template: string };
  unit: { id: string; name: string; belle_token: string; belle_cod_estab: string };
  belleUrl: string;
  evogoUrl: string;
};

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function runOneCron(
  supabase: SupabaseAdmin,
  ctx: CronContext,
  now: Date,
): Promise<{ count: number; dispatched: number; errors: string[] }> {
  const { cron, template, unit, belleUrl, evogoUrl } = ctx;
  const errors: string[] = [];

  // Data-alvo no Belle: hoje (Brasil) + (-days_offset). days_offset negativo = mensagem
  // antes do agendamento, então a partir de hoje olhamos pra `-days_offset` dias à frente.
  const br = getBrazilParts(now);
  const target = addDaysCalendar(br.year, br.month, br.day, -cron.days_offset);
  const dataBelle = toBelleDate(target.year, target.month, target.day);

  const params: Record<string, string> = {
    codEstab: unit.belle_cod_estab,
    dtInicio: dataBelle,
    dtFim: dataBelle,
  };
  if (cron.status_filter) params.status = cron.status_filter;
  if (cron.tipo_filter) params.tipoAgendamento = cron.tipo_filter;

  type BelleAg = {
    codConsulta: number;
    dtAgenda: string;
    hrConsulta: string;
    cliente: { cod: string; nome: string };
    prof?: { cod: string; nome: string };
    servicos?: Array<{ cod: string; nome: string }>;
  };
  type BelleCli = { celular?: string; celular2?: string; telefone?: string };

  const lista =
    (await belleGet<BelleAg[]>(belleUrl, unit.belle_token, "/agendamentos", params)) ?? [];

  // Enriquecer com celular
  const codigos = Array.from(new Set(lista.map((a) => a.cliente?.cod).filter(Boolean)));
  const celulares = new Map<string, string>();
  const concurrency = 5;
  for (let i = 0; i < codigos.length; i += concurrency) {
    const slice = codigos.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (cod) => {
        try {
          const cli = await belleGet<BelleCli>(belleUrl, unit.belle_token, "/cliente/listar", {
            codEstab: unit.belle_cod_estab,
            id: cod,
          });
          const cel = cli?.celular || cli?.celular2 || cli?.telefone || "";
          if (cel) celulares.set(cod, cel);
        } catch (err) {
          console.warn(`[cron] cliente ${cod}`, err);
        }
      }),
    );
  }

  // Filtra agendamentos sem celular
  const validos = lista.filter((a) => celulares.get(a.cliente?.cod));

  // Merge: cliente+data → uma mensagem com horários/serviços/profissionais combinados.
  type Group = {
    items: BelleAg[];
    celular: string;
  };
  const groups = new Map<string, Group>();
  for (const a of validos) {
    const key = `${a.cliente.cod}|${a.dtAgenda}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(a);
    } else {
      groups.set(key, { items: [a], celular: celulares.get(a.cliente.cod)! });
    }
  }

  const joinPt = (xs: string[]): string => {
    if (xs.length === 0) return "";
    if (xs.length === 1) return xs[0];
    if (xs.length === 2) return `${xs[0]} e ${xs[1]}`;
    return `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
  };

  const rows = Array.from(groups.values()).map(({ items, celular }) => {
    items.sort((a, b) => a.hrConsulta.localeCompare(b.hrConsulta));
    const first = items[0];
    const horarios = items.map((i) => i.hrConsulta);
    const servicos = Array.from(
      new Set(items.flatMap((i) => i.servicos?.map((s) => s.nome) ?? [])),
    );
    const profissionais = Array.from(new Set(items.map((i) => i.prof?.nome ?? "").filter(Boolean)));
    const servicosFmt =
      servicos.length > 1 ? servicos.map((s) => `- ${s}`).join("\n") : (servicos[0] ?? "");
    const text = substituirVariaveis(template.template, {
      cliente_nome: toTitleCase(first.cliente.nome),
      cliente_p_nome: toTitleCase(first.cliente.nome.trim().split(/\s+/)[0] || first.cliente.nome),
      cliente_cod: first.cliente.cod,
      data: first.dtAgenda,
      hora: joinPt(horarios),
      profissional: joinPt(profissionais),
      servicos: servicosFmt,
      unidade: unit.name,
    });
    return {
      unit_id: unit.id,
      message_id: template.id,
      instance_id: ctx.targetInstanceId,
      number: celular,
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
        codConsultas: items.map((i) => i.codConsulta),
        quantidade: items.length,
        cronJobId: cron.id,
      },
    };
  });

  if (rows.length === 0) {
    return { count: 0, dispatched: 0, errors };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("send_queue")
    .insert(rows)
    .select("id, instance_id, number, text, message_id");
  if (insErr) throw new Error(`insert send_queue: ${insErr.message}`);

  if (!cron.auto_dispatch) {
    return { count: inserted?.length ?? 0, dispatched: 0, errors };
  }

  // Auto-dispatch: pega apikey de cada instância (cache) e envia.
  let dispatched = 0;
  const apikeyCache = new Map<string, string>();
  for (const item of inserted ?? []) {
    if (!item.instance_id) {
      errors.push(`item ${item.id}: sem instância`);
      continue;
    }
    let apikey = apikeyCache.get(item.instance_id);
    if (!apikey) {
      const { data: inst } = await supabase
        .from("instances")
        .select("evogo_api_key")
        .eq("id", item.instance_id)
        .maybeSingle();
      if (!inst?.evogo_api_key) {
        errors.push(`item ${item.id}: instância sem apikey`);
        continue;
      }
      apikey = inst.evogo_api_key;
      apikeyCache.set(item.instance_id, apikey);
    }
    const numeroLimpo = item.number.replace(/\D/g, "");
    let success = false;
    let errorMsg: string | null = null;
    try {
      await evogoSend(evogoUrl, apikey, numeroLimpo, item.text);
      success = true;
      dispatched++;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`item ${item.id}: ${errorMsg}`);
    }
    await supabase.from("message_send_logs").insert({
      instance_id: item.instance_id,
      message_id: item.message_id,
      number: numeroLimpo,
      text: item.text,
      success,
      error: errorMsg,
    });
    const { error: updateErr } = await supabase
      .from("send_queue")
      .update({ status: success ? "sent" : "failed" })
      .eq("id", item.id);
    if (updateErr) errors.push(`item ${item.id}: erro ao atualizar status (${updateErr.message})`);
  }

  return { count: inserted?.length ?? 0, dispatched, errors };
}

export async function runCronTick(opts?: { onlyJobId?: string; skipShouldRun?: boolean }): Promise<{
  ran: number;
  results: Array<{ id: string; ok: boolean; count?: number; dispatched?: number; error?: string }>;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const results: Array<{
    id: string;
    ok: boolean;
    count?: number;
    dispatched?: number;
    error?: string;
  }> = [];

  // Carrega configs globais uma única vez
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("belle_base_url, evogo_url")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.belle_base_url || !settings?.evogo_url) {
    console.error("[cron] URLs não configuradas em app_settings — pulando tick");
    return { ran: 0, results };
  }
  const belleUrl = settings.belle_base_url.replace(/\/+$/, "");
  const evogoUrl = settings.evogo_url.replace(/\/+$/, "");

  let query = supabaseAdmin.from("cron_jobs").select("*");
  if (opts?.onlyJobId) {
    query = query.eq("id", opts.onlyJobId);
  } else {
    query = query.eq("active", true);
  }
  const { data: jobs, error } = await query;
  if (error) {
    console.error("[cron] falha ao listar jobs", error.message);
    return { ran: 0, results };
  }

  for (const cron of jobs ?? []) {
    if (!opts?.skipShouldRun && !shouldRun(cron, now)) continue;

    let ok = false;
    let runCount = 0;
    let runDispatched = 0;
    let errMsg: string | undefined;
    try {
      // Carrega template + unidade
      const { data: tpl, error: tplErr } = await supabaseAdmin
        .from("messages")
        .select("id, template, unit_ids")
        .eq("id", cron.message_id)
        .maybeSingle();
      if (tplErr || !tpl) throw new Error(`template ${cron.message_id} não encontrado`);

      let unitQuery = supabaseAdmin.from("units").select("id, name, belle_token, belle_cod_estab");
      if (cron.unit_ids && cron.unit_ids.length > 0) {
        unitQuery = unitQuery.in("id", cron.unit_ids);
      } else {
        unitQuery = unitQuery.eq("company_id", cron.company_id);
      }
      const { data: unitsToRun, error: unitErr } = await unitQuery;
      
      if (unitErr || !unitsToRun || unitsToRun.length === 0) {
        throw new Error("Nenhuma unidade encontrada para esta automação");
      }

      const { data: allInstances } = await supabaseAdmin
        .from("instances")
        .select("id, unit_id, status")
        .in("unit_id", unitsToRun.map((u) => u.id));

      ok = true;
      for (const unit of unitsToRun) {
        if (!unit.belle_token || !unit.belle_cod_estab) {
          errMsg = (errMsg ? errMsg + "; " : "") + `unidade ${unit.name} sem token`;
          ok = false;
          continue;
        }

        let targetInstanceId: string | null = null;
        if (cron.instance_mapping && typeof cron.instance_mapping === "object") {
          targetInstanceId = (cron.instance_mapping as Record<string, string>)[unit.id] ?? null;
        }

        if (!targetInstanceId) {
          const unitInstances = allInstances?.filter((i) => i.unit_id === unit.id) ?? [];
          const inst = unitInstances.find((i) => i.status === "connected") ?? unitInstances[0];
          targetInstanceId = inst?.id ?? null;
        }

        const r = await runOneCron(
          supabaseAdmin,
          {
            cron,
            targetInstanceId,
            template: { id: tpl.id, template: tpl.template },
            unit: {
              id: unit.id,
              name: unit.name,
              belle_token: unit.belle_token,
              belle_cod_estab: unit.belle_cod_estab,
            },
            belleUrl,
            evogoUrl,
          },
          now,
        );
        runCount += r.count;
        runDispatched += r.dispatched;
        if (r.errors.length > 0) {
          errMsg = (errMsg ? errMsg + "; " : "") + r.errors.join("; ").slice(0, 500);
          ok = false;
        }
      }
    } catch (err) {
      errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] job ${cron.id} falhou`, errMsg);
    }

    await supabaseAdmin
      .from("cron_jobs")
      .update({
        last_run_at: now.toISOString(),
        last_run_status: ok ? "success" : "error",
        last_run_error: errMsg ?? null,
        last_run_count: runCount,
      })
      .eq("id", cron.id);

    results.push({
      id: cron.id,
      ok,
      count: runCount,
      dispatched: runDispatched,
      error: errMsg,
    });
  }

  return { ran: results.length, results };
}
