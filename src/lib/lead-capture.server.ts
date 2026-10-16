// Server-only: motor da Captura de Leads via link público.
// Fluxo: link -> sessão + instância (QR) -> conectou -> extrai grupos/participantes -> leads -> remove instância.
import { after } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createEvogoInstance,
  deleteEvogoInstance,
  fetchEvogoGroupInfo,
  fetchEvogoGroups,
  fetchEvogoQrCode,
  fetchEvogoStatus,
  logoutEvogoInstance,
} from "@/lib/evogo";
import {
  getGroupParticipants,
  normalizeGroupList,
  participantsToContacts,
} from "@/lib/whatsapp-groups";
import { upsertGroupContacts } from "@/lib/group-leads.server";

const QR_TIMEOUT_MS = 10 * 60_000; // tempo máximo aguardando a leitura do QR
const HEARTBEAT_STALE_MS = 5 * 60_000; // extração sem sinal de vida -> retomar
const GROUP_INFO_DELAY_MS = 1200; // pausa entre chamadas /group/info (evita rate limit)
const MAX_ACTIVE_SESSIONS_PER_LINK = 5;

export type CaptureStatus =
  | "awaiting_connection"
  | "extracting"
  | "completed"
  | "failed"
  | "expired";

export type CaptureSessionView = {
  sessionId: string;
  status: CaptureStatus;
  qrBase64: string | null;
  groupsTotal: number;
  groupsDone: number;
  groupsFailed: number;
  participantsProcessed: number;
  skippedWithoutPhone: number;
  leadsInserted: number;
  leadsUpdated: number;
  error: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SESSION_COLUMNS =
  "id, link_id, company_id, unit_id, person_name, instance_id, status, groups_total, groups_done, groups_failed, participants_processed, skipped_without_phone, leads_inserted, leads_updated, processed_group_jids, error, heartbeat_at, created_at";

function toView(s: any, qrBase64: string | null = null): CaptureSessionView {
  return {
    sessionId: s.id,
    status: s.status,
    qrBase64,
    groupsTotal: s.groups_total ?? 0,
    groupsDone: s.groups_done ?? 0,
    groupsFailed: s.groups_failed ?? 0,
    participantsProcessed: s.participants_processed ?? 0,
    skippedWithoutPhone: s.skipped_without_phone ?? 0,
    leadsInserted: s.leads_inserted ?? 0,
    leadsUpdated: s.leads_updated ?? 0,
    error: s.error ?? null,
  };
}

async function updateSession(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("lead_capture_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error(`[lead-capture] Falha ao atualizar sessão ${id}:`, error.message);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function loadLinkByToken(token: string) {
  if (!token || typeof token !== "string" || token.length > 128) return null;
  const { data } = await supabaseAdmin
    .from("lead_capture_links")
    .select("id, company_id, unit_id, name, active, companies(name), units(name)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;

  // Busca as unidades ativas da empresa
  const { data: units } = await supabaseAdmin
    .from("units")
    .select("id, name")
    .eq("company_id", data.company_id)
    .order("name");

  return {
    ...data,
    companyUnits: (units as { id: string; name: string }[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

export async function startSession(
  token: string,
  rawPersonName: string,
  chosenUnitId?: string | null,
): Promise<CaptureSessionView> {
  const personName = String(rawPersonName ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (personName.length < 2 || personName.length > 80) {
    throw new Error("Informe o nome da colaboradora (entre 2 e 80 caracteres).");
  }

  const link = await loadLinkByToken(token);
  if (!link || !link.active) throw new Error("Link inválido ou desativado.");

  // Se o link já tiver uma unidade definida, usa ela.
  // Se não tiver (link geral), usa a unidade escolhida pela colaboradora se for válida para a empresa.
  let effectiveUnitId = link.unit_id;
  if (!effectiveUnitId && chosenUnitId) {
    const isValid = link.companyUnits.some((u: { id: string; name: string }) => u.id === chosenUnitId);
    if (isValid) effectiveUnitId = chosenUnitId;
  }

  const { count } = await supabaseAdmin
    .from("lead_capture_sessions")
    .select("id", { count: "exact", head: true })
    .eq("link_id", link.id)
    .in("status", ["awaiting_connection", "extracting"]);
  if ((count ?? 0) >= MAX_ACTIVE_SESSIONS_PER_LINK) {
    throw new Error(
      "Há muitas conexões em andamento neste link. Tente novamente em alguns minutos.",
    );
  }

  // Sufixo aleatório evita colisão de nome técnico no EvoGo entre pessoas com o mesmo nome
  const suffix = crypto.randomUUID().slice(0, 6);
  const instance = await createEvogoInstance({
    data: {
      unitId: effectiveUnitId,
      companyId: link.company_id,
      name: `Captura ${personName} ${suffix}`,
    },
  });

  const { data: session, error } = await supabaseAdmin
    .from("lead_capture_sessions")
    .insert({
      link_id: link.id,
      company_id: link.company_id,
      unit_id: effectiveUnitId,
      person_name: personName,
      instance_id: instance.id,
      status: "awaiting_connection",
    })
    .select(SESSION_COLUMNS)
    .single();

  if (error || !session) {
    await deleteEvogoInstance({ data: { instanceId: instance.id } }).catch(() => {});
    throw new Error("Não foi possível iniciar a conexão. Tente novamente.");
  }

  return toView(session, instance.qrBase64 ?? null);
}

export async function getSessionStatus(
  token: string,
  sessionId: string,
): Promise<CaptureSessionView> {
  const link = await loadLinkByToken(token);
  if (!link) throw new Error("Link inválido.");

  const { data: session } = await supabaseAdmin
    .from("lead_capture_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("link_id", link.id)
    .maybeSingle();
  if (!session) throw new Error("Sessão não encontrada.");

  if (session.status === "awaiting_connection") {
    return handleAwaitingConnection(session);
  }

  if (session.status === "extracting" && isHeartbeatStale(session.heartbeat_at)) {
    await reclaimAndRun(session.id, "extracting");
  }

  return toView(session);
}

async function handleAwaitingConnection(session: any): Promise<CaptureSessionView> {
  if (Date.now() - new Date(session.created_at).getTime() > QR_TIMEOUT_MS) {
    await expireSession(session);
    return toView({
      ...session,
      status: "expired",
      error: "Tempo para leitura do QR Code esgotado.",
    });
  }

  if (!session.instance_id) {
    await updateSession(session.id, { status: "failed", error: "Instância não encontrada." });
    return toView({ ...session, status: "failed", error: "Instância não encontrada." });
  }

  let qr: { qrBase64: string | null; connected: boolean } = { qrBase64: null, connected: false };
  try {
    qr = await fetchEvogoQrCode({ data: { instanceId: session.instance_id } });
  } catch (err: any) {
    console.warn(`[lead-capture] Falha ao obter QR da sessão ${session.id}:`, err.message);
  }

  let isConnected = qr.connected;
  if (!isConnected) {
    try {
      const st = await fetchEvogoStatus({ data: { instanceId: session.instance_id } });
      if (st.connected || st.status === "connected") {
        isConnected = true;
      }
    } catch {
      // silencioso
    }
  }

  if (isConnected) {
    const claimed = await reclaimAndRun(session.id, "awaiting_connection");
    return toView({ ...session, status: claimed ? "extracting" : session.status });
  }

  return toView(session, qr.qrBase64);
}

function isHeartbeatStale(heartbeatAt: string | null) {
  return !heartbeatAt || Date.now() - new Date(heartbeatAt).getTime() > HEARTBEAT_STALE_MS;
}

/**
 * Reivindica a sessão de forma atômica (apenas um processo vence) e agenda a extração
 * para rodar em segundo plano após a resposta.
 */
async function reclaimAndRun(sessionId: string, fromStatus: "awaiting_connection" | "extracting") {
  const now = new Date().toISOString();
  let query = supabaseAdmin
    .from("lead_capture_sessions")
    .update({ status: "extracting", heartbeat_at: now, updated_at: now })
    .eq("id", sessionId)
    .eq("status", fromStatus);

  if (fromStatus === "extracting") {
    const staleBefore = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();
    query = query.or(`heartbeat_at.is.null,heartbeat_at.lt.${staleBefore}`);
  }

  const { data } = await query.select("id");
  if (!data || data.length === 0) return false;

  after(() => runExtraction(sessionId));
  return true;
}

async function expireSession(session: any) {
  await updateSession(session.id, {
    status: "expired",
    error: "Tempo para leitura do QR Code esgotado.",
    completed_at: new Date().toISOString(),
  });
  await teardownInstance(session.id, session.instance_id);
}

async function teardownInstance(sessionId: string, instanceId: string | null) {
  if (!instanceId) return;
  await logoutEvogoInstance({ data: { instanceId } }).catch(() => {});
  await deleteEvogoInstance({ data: { instanceId } }).catch((err: any) =>
    console.warn(`[lead-capture] Falha ao excluir instância ${instanceId}:`, err?.message),
  );
  await updateSession(sessionId, { instance_id: null });
}

/** Melhor esforço para descobrir o número do próprio dono do WhatsApp (para não virar lead). */
async function detectOwnNumber(instanceId: string): Promise<string | null> {
  try {
    const res: any = await fetchEvogoStatus({ data: { instanceId } });
    const candidates = [
      res?.data?.Jid,
      res?.data?.JID,
      res?.data?.jid,
      res?.Jid,
      res?.JID,
      res?.jid,
      res?.data?.PhoneNumber,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c) {
        const digits = c.split("@")[0].split(":")[0].replace(/\D/g, "");
        if (digits.length >= 10) return digits;
      }
    }
  } catch {
    /* ignorado */
  }
  return null;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Extração (roda em segundo plano)
// ---------------------------------------------------------------------------

async function runExtraction(sessionId: string) {
  const { data: session } = await supabaseAdmin
    .from("lead_capture_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "extracting") return;

  const instanceId: string | null = session.instance_id;
  console.log(`[lead-capture] Iniciando extração da sessão ${sessionId} (${session.person_name})`);

  try {
    if (!instanceId) throw new Error("Instância não encontrada.");

    const ownNumber = await detectOwnNumber(instanceId);
    let unitName: string | null = null;
    if (session.unit_id) {
      const { data: u } = await supabaseAdmin
        .from("units")
        .select("name")
        .eq("id", session.unit_id)
        .maybeSingle();
      unitName = u?.name ?? null;
    }
    const rawGroups = await withRetry(() => fetchEvogoGroups({ data: { instanceId } }));
    const groups = normalizeGroupList(rawGroups);

    const processed = new Set<string>(
      Array.isArray(session.processed_group_jids) ? session.processed_group_jids : [],
    );
    const counters = {
      groups_failed: session.groups_failed ?? 0,
      participants_processed: session.participants_processed ?? 0,
      skipped_without_phone: session.skipped_without_phone ?? 0,
      leads_inserted: session.leads_inserted ?? 0,
      leads_updated: session.leads_updated ?? 0,
    };

    await updateSession(sessionId, {
      groups_total: groups.length,
      groups_done: processed.size,
      heartbeat_at: new Date().toISOString(),
    });

    for (const group of groups) {
      if (processed.has(group.jid)) continue;

      try {
        let participants = group.participants;
        if (!participants || participants.length === 0) {
          await sleep(GROUP_INFO_DELAY_MS);
          const info = await withRetry(() =>
            fetchEvogoGroupInfo({ data: { instanceId, groupJid: group.jid } }),
          );
          participants = getGroupParticipants(info) ?? [];
        }

        const { contacts, skippedWithoutPhone } = participantsToContacts(
          participants,
          ownNumber ? [ownNumber] : [],
        );
        const { inserted, updated } = await upsertGroupContacts({
          companyId: session.company_id,
          unitId: session.unit_id,
          contacts,
          group: {
            jid: group.jid,
            name: group.name,
            imported_at: new Date().toISOString(),
            source: "capture_link",
            captured_by: session.person_name,
            unit_id: session.unit_id,
            unit_name: unitName,
            capture_session_id: sessionId,
          },
        });

        counters.participants_processed += contacts.length;
        counters.skipped_without_phone += skippedWithoutPhone;
        counters.leads_inserted += inserted;
        counters.leads_updated += updated;
      } catch (err: any) {
        console.error(
          `[lead-capture] Falha no grupo ${group.jid} (sessão ${sessionId}):`,
          err?.message,
        );
        counters.groups_failed += 1;
      }

      processed.add(group.jid);
      await updateSession(sessionId, {
        ...counters,
        groups_done: processed.size,
        processed_group_jids: [...processed],
        heartbeat_at: new Date().toISOString(),
      });
    }

    await updateSession(sessionId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      error: null,
    });
    console.log(
      `[lead-capture] Sessão ${sessionId} concluída: ${counters.leads_inserted} novos leads.`,
    );
  } catch (err: any) {
    console.error(`[lead-capture] Erro na extração da sessão ${sessionId}:`, err?.message);
    await updateSession(sessionId, {
      status: "failed",
      error: err?.message || "Erro inesperado durante a extração.",
      completed_at: new Date().toISOString(),
    });
  } finally {
    // A instância serve apenas para a extração: desconecta e exclui
    await teardownInstance(sessionId, instanceId);
  }
}

// ---------------------------------------------------------------------------
// Limpeza periódica (chamada pelo /api/cron-trigger)
// ---------------------------------------------------------------------------

/**
 * - Expira sessões cujo QR nunca foi lido (e remove a instância)
 * - Retoma extrações interrompidas (ex: servidor reiniciou)
 */
export async function maintainCaptureSessions() {
  const qrDeadline = new Date(Date.now() - QR_TIMEOUT_MS).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("lead_capture_sessions")
    .select("id, instance_id")
    .eq("status", "awaiting_connection")
    .lt("created_at", qrDeadline)
    .limit(50);
  for (const s of stale ?? []) await expireSession(s);

  const heartbeatDeadline = new Date(Date.now() - HEARTBEAT_STALE_MS).toISOString();
  const { data: stuck } = await supabaseAdmin
    .from("lead_capture_sessions")
    .select("id")
    .eq("status", "extracting")
    .or(`heartbeat_at.is.null,heartbeat_at.lt.${heartbeatDeadline}`)
    .limit(10);
  for (const s of stuck ?? []) await reclaimAndRun(s.id, "extracting");

  return { expired: stale?.length ?? 0, resumed: stuck?.length ?? 0 };
}
