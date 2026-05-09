import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadEvogoSettings(): Promise<{ url: string; adminToken: string; proxy: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler configurações: ${error.message}`);
  if (!data?.evogo_url || !data?.evogo_admin_token) {
    throw new Error("URL ou admin token do Evogo não configurados em /settings.");
  }

  // Tenta buscar o proxy separadamente para não quebrar se a coluna ainda não existir
  let proxy: string | null = null;
  try {
    const { data: proxyData } = await supabaseAdmin
      .from("app_settings")
      .select("evogo_proxy")
      .eq("id", true)
      .maybeSingle();
    proxy = proxyData?.evogo_proxy ?? null;
  } catch (e) {
    console.warn("[evogo] Coluna evogo_proxy não encontrada no banco. Rode a migração.");
  }

  return {
    url: data.evogo_url.replace(/\/+$/, ""),
    adminToken: data.evogo_admin_token,
    proxy,
  };
}

async function evogoFetch(
  path: string,
  opts: { url: string; apikey: string; method: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${opts.url}${path}`, {
    method: opts.method,
    headers: {
      "Content-Type": "application/json",
      apikey: opts.apikey,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
    const detail = extractErrorMessage(parsed) ?? text.slice(0, 500) ?? `HTTP ${res.status}`;
    console.error(`[evogo] ${opts.method} ${path} -> ${res.status}`, parsed ?? text);
    throw new Error(`Evogo ${res.status}: ${detail}`);
  }
  // Sucesso: loga shape (omite base64 grande do QR pra não poluir).
  console.log(`[evogo] OK ${opts.method} ${path} ->`, summarizeResponse(parsed));
  return parsed;
}

function summarizeResponse(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  // Trunca campos com base64 enormes para o log ficar legível.
  const stripBase64 = (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "string" && v.length > 200 && /base64|qrcode/i.test(k)) {
        obj[k] = `<${v.length} chars>`;
      } else if (v && typeof v === "object") {
        stripBase64(v as Record<string, unknown>);
      }
    }
  };
  stripBase64(clone);
  return clone;
}

function extractErrorMessage(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === "string") return payload || null;
  if (typeof payload !== "object") return String(payload);
  const p = payload as Record<string, unknown>;
  // Evolution às vezes aninha em response.message ou error.message
  for (const key of ["message", "error", "msg", "detail"]) {
    const v = p[key];
    if (typeof v === "string" && v) return v;
    if (Array.isArray(v) && v.length) return v.map(String).join("; ");
    if (v && typeof v === "object") {
      const nested = extractErrorMessage(v);
      if (nested) return nested;
    }
  }
  if (p.response && typeof p.response === "object") {
    return extractErrorMessage(p.response);
  }
  return JSON.stringify(payload).slice(0, 500);
}

function pickHash(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.hash === "string") return p.hash;
  if (p.hash && typeof p.hash === "object" && "apikey" in p.hash) {
    return String((p.hash as { apikey: unknown }).apikey);
  }
  if (p.instance && typeof p.instance === "object" && "token" in p.instance) {
    return String((p.instance as { token: unknown }).token);
  }
  return null;
}

function pickInstanceId(payload: unknown): string | null {
  // Procura recursivamente por uma string em formato UUID (8-4-4-4-12 hex).
  // Lida com Evolution oficial (v1/v2) e forks Go que aninham diferente.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const visited = new WeakSet<object>();
  const findUuid = (v: unknown): string | null => {
    if (typeof v === "string") return UUID_RE.test(v) ? v : null;
    if (!v || typeof v !== "object" || visited.has(v as object)) return null;
    visited.add(v as object);
    const obj = v as Record<string, unknown>;
    // Prioriza chaves nomeadas
    for (const key of ["id", "instanceId", "instanceID", "uuid", "key"]) {
      const val = obj[key];
      if (typeof val === "string" && UUID_RE.test(val)) return val;
    }
    // Cai pra varredura geral
    for (const val of Object.values(obj)) {
      const found = findUuid(val);
      if (found) return found;
    }
    return null;
  };
  return findUuid(payload);
}

function pickQrBase64(payload: unknown): string | null {
  // Procura recursivamente por uma string longa cujo nome de chave bata (case-insensitive)
  // com qrcode/qr/base64/qrcodeImage etc. Cobre Evolution oficial (qrcode.base64) e fork Go (Qrcode).
  const visited = new WeakSet<object>();
  const QR_KEY_RE = /^(qr(code)?(image)?|base64|image)$/i;
  const find = (v: unknown): string | null => {
    if (!v || typeof v !== "object" || visited.has(v as object)) return null;
    visited.add(v as object);
    const obj = v as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      if (QR_KEY_RE.test(key)) {
        if (typeof val === "string" && val.length > 50) return val;
        if (val && typeof val === "object") {
          const inner = find(val);
          if (inner) return inner;
        }
      }
    }
    for (const val of Object.values(obj)) {
      const found = find(val);
      if (found) return found;
    }
    return null;
  };
  return find(payload);
}

function mapState(raw: unknown): "connected" | "connecting" | "disconnected" {
  if (raw === true) return "connected";
  if (raw === false) return "disconnected";
  if (typeof raw === "string") {
    const s = raw.toLowerCase().trim();
    if (s === "open" || s === "connected" || s === "online" || s === "active" || s === "ready") {
      return "connected";
    }
    if (s === "connecting" || s === "pairing" || s === "loading") return "connecting";
  }
  return "disconnected";
}

function pickConnectionState(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  const d = (p.data as Record<string, unknown>) ?? p;
  const i = (p.instance as Record<string, unknown>) ?? {};

  // Prioriza 'loggedIn' pois 'connected' pode significar apenas que o socket está aberto,
  // mas sem sessão ativa no WhatsApp.
  for (const key of ["loggedIn", "LoggedIn", "isLoggedIn"]) {
    if (key in d && d[key] !== null) return d[key];
    if (key in i && i[key] !== null) return i[key];
  }

  for (const key of ["connected", "Connected", "isConnected"]) {
    if (key in d && d[key] !== null) return d[key];
    if (key in i && i[key] !== null) return i[key];
  }

  for (const key of ["status", "state", "connectionStatus", "connectionState"]) {
    if (key in d && d[key] != null) return d[key];
    if (key in i && i[key] != null) return i[key];
    if (key in p && p[key] != null) return p[key];
  }
  return undefined;
}

/**
 * Tenta cada combinação método+caminho em ordem; a primeira que não der 404 vence.
 * Outros erros (auth, validação) propagam.
 */
type PathAttempt = string | { method: string; path: string; body?: unknown };

async function tryPaths(
  attempts: PathAttempt[],
  defaults: { url: string; apikey: string; method: string; body?: unknown },
): Promise<{ method: string; path: string; data: unknown }> {
  let lastErr: Error | null = null;
  for (const a of attempts) {
    const method = typeof a === "string" ? defaults.method : a.method;
    const path = typeof a === "string" ? a : a.path;
    const body = typeof a === "string" ? defaults.body : a.body;
    try {
      const data = await evogoFetch(path, {
        url: defaults.url,
        apikey: defaults.apikey,
        method,
        body,
      });
      console.log(`[evogo] resolvido: ${method} ${path}`);
      return { method, path, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!/\b404\b/.test(msg)) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error("Nenhum endpoint conhecido respondeu");
}

export const createEvogoInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        unitId: z.string().uuid(),
        name: z.string().trim().min(1),
        proxy: z.string().trim().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: unit, error: unitErr } = await supabase
      .from("units")
      .select("id, name, companies(name)")
      .eq("id", data.unitId)
      .maybeSingle();
    if (unitErr) throw new Error(unitErr.message);
    if (!unit) throw new Error("Unidade não encontrada ou sem permissão.");

    const companyName = (unit.companies as { name: string } | null)?.name ?? "default";
    const instanceName = `${slugify(companyName)}-${slugify(unit.name)}-${slugify(data.name)}`;

    // Token próprio: enviamos para a Evolution e ela passa a aceitá-lo como apikey desta instância.
    const instanceToken = crypto.randomUUID().replace(/-/g, "");

    const { url, adminToken, proxy } = await loadEvogoSettings();
    const created = await evogoFetch("/instance/create", {
      url,
      apikey: adminToken,
      method: "POST",
      body: {
        // Evolution API v2 usa `name`; versões antigas usavam `instanceName`. Mandamos os dois.
        name: instanceName,
        instanceName,
        token: instanceToken,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        proxy: data.proxy || proxy || undefined,
      },
    });

    // Se o servidor retornou o hash usamos; caso contrário, persistimos o token que geramos.
    const hash = pickHash(created) ?? instanceToken;
    const evogoInstanceId = pickInstanceId(created);
    const qrBase64 = pickQrBase64(created);

    const { data: inserted, error: insertErr } = await supabase
      .from("instances")
      .insert({
        unit_id: data.unitId,
        name: data.name,
        instance_name: instanceName,
        evogo_api_key: hash,
        evogo_instance_id: evogoInstanceId,
        status: "disconnected",
      })
      .select("id, instance_name")
      .single();
    if (insertErr) throw new Error(`Falha ao salvar instância: ${insertErr.message}`);

    return { id: inserted.id, instanceName: inserted.instance_name, qrBase64 };
  });

type SupabaseUserClient = import("@supabase/supabase-js").SupabaseClient<
  import("@/integrations/supabase/types").Database
>;

async function loadInstanceRefs(
  supabase: SupabaseUserClient,
  rowId: string,
): Promise<{ apikey: string; instanceName: string; evogoId: string | null }> {
  const { data, error } = await supabase
    .from("instances")
    .select("instance_name, evogo_api_key, evogo_instance_id")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Instância não encontrada ou sem permissão.");
  return {
    apikey: data.evogo_api_key,
    instanceName: data.instance_name,
    evogoId: data.evogo_instance_id,
  };
}

export const fetchEvogoQrCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { apikey } = await loadInstanceRefs(context.supabase, data.instanceId);
    const { url } = await loadEvogoSettings();

    // /instance/connect é idempotente: garante subscribe + inicializa o pareamento se não conectado.
    try {
      await evogoFetch("/instance/connect", {
        url,
        apikey,
        method: "POST",
        body: { subscribe: ["QRCODE", "CONNECTION"] },
      });
    } catch (err) {
      console.warn("[evogo] connect (pré-QR) falhou (ignorado)", err);
    }

    // Fonte da verdade do estado é /instance/status (não confiar no jid de /connect — pode ficar stale).
    let connected = false;
    try {
      const statusRes = await evogoFetch("/instance/status", { url, apikey, method: "GET" });
      const stateRaw = pickConnectionState(statusRes);
      console.log("[evogo] qr/status raw =", stateRaw, "→ mapeado =", mapState(stateRaw));
      connected = mapState(stateRaw) === "connected";
    } catch (err) {
      console.warn("[evogo] status check falhou (ignorado)", err);
    }

    if (connected) {
      await context.supabase
        .from("instances")
        .update({ status: "connected" })
        .eq("id", data.instanceId);
      return { qrBase64: null, connected: true };
    }

    try {
      const res = await evogoFetch("/instance/qr", { url, apikey, method: "GET" });
      const qrBase64 = pickQrBase64(res);
      if (qrBase64) {
        await context.supabase
          .from("instances")
          .update({ status: "connecting" })
          .eq("id", data.instanceId);
      }
      return { qrBase64, connected: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // "session already logged in" — improvável aqui (já checamos status), mas mantém como safety net.
      if (/already (logged in|connected)|session.*logged/i.test(msg)) {
        await context.supabase
          .from("instances")
          .update({ status: "connected" })
          .eq("id", data.instanceId);
        return { qrBase64: null, connected: true };
      }
      throw err;
    }
  });

export const fetchEvogoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { apikey } = await loadInstanceRefs(context.supabase, data.instanceId);
    const { url } = await loadEvogoSettings();
    const res = await evogoFetch("/instance/status", { url, apikey, method: "GET" });
    console.log(`[evogo] status raw response for ${data.instanceId}:`, JSON.stringify(res));
    const stateRaw = pickConnectionState(res);
    const status = mapState(stateRaw);
    console.log(`[evogo] stateRaw: ${stateRaw}, mapped status: ${status}`);
    await context.supabase.from("instances").update({ status }).eq("id", data.instanceId);
    return { status };
  });

export const logoutEvogoInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { apikey } = await loadInstanceRefs(context.supabase, data.instanceId);
    const { url } = await loadEvogoSettings();
    await evogoFetch("/instance/logout", { url, apikey, method: "DELETE" });
    await context.supabase
      .from("instances")
      .update({ status: "disconnected" })
      .eq("id", data.instanceId);
    return { ok: true };
  });

async function dispatchText(
  supabase: SupabaseUserClient,
  params: {
    instanceId: string;
    number: string;
    text: string;
    delay?: number;
    messageId?: string | null;
  },
): Promise<{ success: boolean; error: string | null; number: string }> {
  const { apikey } = await loadInstanceRefs(supabase, params.instanceId);
  const { url } = await loadEvogoSettings();
  const number = params.number.replace(/\D/g, "");
  if (number.length < 10) {
    throw new Error("Número inválido (precisa do DDI+DDD+número).");
  }

  let success = false;
  let errorMsg: string | null = null;
  try {
    await evogoFetch("/send/text", {
      url,
      apikey,
      method: "POST",
      body: { number, text: params.text, delay: params.delay ?? 0 },
    });
    success = true;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Erro mais comum: instância sem WhatsApp pareado.
    if (/device JID|not.*logged in|no.*session/i.test(raw)) {
      errorMsg =
        "Instância não está conectada ao WhatsApp. Abra o QR Code e escaneie com seu celular antes de enviar.";
      // Reconcilia: nosso banco achava que estava conectada, mas a Evogo perdeu a sessão.
      await supabase
        .from("instances")
        .update({ status: "disconnected" })
        .eq("id", params.instanceId);
    } else {
      errorMsg = raw;
    }
  }

  await supabase
    .from("message_send_logs")
    .insert({
      instance_id: params.instanceId,
      message_id: params.messageId ?? null,
      number,
      text: params.text,
      success,
      error: errorMsg,
    })
    .then(({ error }) => {
      if (error) console.warn("[evogo] falha ao gravar log de envio", error.message);
    });

  return { success, error: errorMsg, number };
}

export const sendEvogoText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        instanceId: z.string().uuid(),
        number: z.string().min(8),
        text: z.string().min(1),
        delay: z.number().int().min(0).max(60000).optional(),
        messageId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const result = await dispatchText(context.supabase, data);
    if (!result.success) throw new Error(result.error ?? "Falha desconhecida ao enviar.");
    return { ok: true, number: result.number };
  });

export const dispatchSendQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ itemId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("send_queue")
      .select("*")
      .eq("id", data.itemId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Item não encontrado.");
    if (item.status !== "pending") {
      throw new Error(`Item não está pendente (status: ${item.status}).`);
    }
    if (!item.instance_id) {
      throw new Error("Item sem instância vinculada — edite e selecione uma.");
    }

    const result = await dispatchText(context.supabase, {
      instanceId: item.instance_id,
      number: item.number,
      text: item.text,
      messageId: item.message_id ?? undefined,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateErr } = await supabaseAdmin
      .from("send_queue")
      .update({
        status: result.success ? "sent" : "failed",
        last_error: result.success ? null : (result.error || "Falha desconhecida"),
      })
      .eq("id", item.id);

    if (updateErr) throw new Error(`Falha ao atualizar status na fila: ${updateErr.message}`);

    if (!result.success) throw new Error(result.error ?? "Falha desconhecida ao enviar.");
    return { ok: true };
  });

export const runCronJobNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ cronJobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Garante que o usuário tem acesso à automação (RLS).
    const { data: cron, error } = await context.supabase
      .from("cron_jobs")
      .select("id")
      .eq("id", data.cronJobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cron) throw new Error("Automação não encontrada ou sem permissão.");

    const { runCronTick } = await import("./cron");
    const result = await runCronTick({ onlyJobId: cron.id, skipShouldRun: true });
    const r = result.results[0];
    if (!r) return { count: 0, dispatched: 0 };
    if (!r.ok) throw new Error(r.error ?? "Falha ao executar.");
    return { count: r.count ?? 0, dispatched: r.dispatched ?? 0 };
  });

export const cancelSendQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ itemId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("send_queue")
      .update({ status: "cancelled" })
      .eq("id", data.itemId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const advancedSettingsSchema = z.object({
  rejectCalls: z.boolean(),
  rejectCallMessage: z.string(),
  readMessages: z.boolean(),
  readStatus: z.boolean(),
  alwaysOnline: z.boolean(),
});
type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;

export const fetchEvogoAdvancedSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ instanceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { evogoId } = await loadInstanceRefs(context.supabase, data.instanceId);
    if (!evogoId) throw new Error("UUID interno da instância no Evogo não disponível.");
    const { url, adminToken } = await loadEvogoSettings();
    const res = await evogoFetch(`/instance/${evogoId}/advanced-settings`, {
      url,
      apikey: adminToken,
      method: "GET",
    });
    const cfg = ((res as { data?: unknown })?.data ?? res) as Partial<AdvancedSettings>;
    return {
      rejectCalls: Boolean(cfg.rejectCalls),
      rejectCallMessage: typeof cfg.rejectCallMessage === "string" ? cfg.rejectCallMessage : "",
      readMessages: Boolean(cfg.readMessages),
      readStatus: Boolean(cfg.readStatus),
      alwaysOnline: Boolean(cfg.alwaysOnline),
    } satisfies AdvancedSettings;
  });

export const updateEvogoAdvancedSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ instanceId: z.string().uuid(), settings: advancedSettingsSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { evogoId } = await loadInstanceRefs(context.supabase, data.instanceId);
    if (!evogoId) throw new Error("UUID interno da instância no Evogo não disponível.");
    const { url, adminToken } = await loadEvogoSettings();
    await evogoFetch(`/instance/${evogoId}/advanced-settings`, {
      url,
      apikey: adminToken,
      method: "PUT",
      body: data.settings,
    });
    return { ok: true };
  });

export const updateEvogoWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ instanceId: z.string().uuid(), webhookUrl: z.string() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { apikey } = await loadInstanceRefs(context.supabase, data.instanceId);
    const { url } = await loadEvogoSettings();
    await evogoFetch("/instance/connect", {
      url,
      apikey,
      method: "POST",
      body: {
        subscribe: ["QRCODE", "CONNECTION"],
        webhookUrl: data.webhookUrl,
      },
    });
    await context.supabase
      .from("instances")
      .update({ webhook_url: data.webhookUrl || null })
      .eq("id", data.instanceId);
    return { ok: true };
  });

export const deleteEvogoInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ instanceId: z.string().uuid(), forceLocal: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.forceLocal) {
      // Cleanup de órfã: remove só do banco sem chamar a Evolution.
      await context.supabase.from("instances").delete().eq("id", data.instanceId);
      return { ok: true, deletedRemote: false };
    }

    const { evogoId } = await loadInstanceRefs(context.supabase, data.instanceId);
    if (!evogoId) {
      throw new Error(
        "UUID interno da instância no Evogo não está salvo. Apague pelo painel Evogo e remova localmente.",
      );
    }
    const { url, adminToken } = await loadEvogoSettings();
    try {
      await evogoFetch(`/instance/delete/${evogoId}`, {
        url,
        apikey: adminToken,
        method: "DELETE",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!/404|not found/i.test(msg)) throw err;
      console.warn("[evogo] delete remoto não encontrado (404), prosseguindo só local");
    }
    await context.supabase.from("instances").delete().eq("id", data.instanceId);
    return { ok: true, deletedRemote: true };
  });
