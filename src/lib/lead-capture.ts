"use server";
// Server Actions PÚBLICAS da Captura de Leads (usadas em /conectar/[token]).
// Toda ação é validada pelo token do link; nenhuma recebe company_id/unit_id do cliente.
import {
  getSessionStatus,
  loadLinkByToken,
  startSession,
  type CaptureSessionView,
} from "@/lib/lead-capture.server";

export async function getCaptureLinkInfo({ token }: { token: string }) {
  const link: any = await loadLinkByToken(token);
  if (!link || !link.active) return { valid: false as const };
  return {
    valid: true as const,
    linkName: link.name as string,
    companyName: (link.companies?.name as string) ?? "",
    unitId: (link.unit_id as string) ?? null,
    unitName: (link.units?.name as string) ?? null,
    units: ((link.companyUnits ?? []) as { id: string; name: string }[]),
  };
}

export async function startCaptureSession({
  token,
  personName,
  unitId,
}: {
  token: string;
  personName: string;
  unitId?: string | null;
}): Promise<{ ok: true; session: CaptureSessionView } | { ok: false; error: string }> {
  try {
    return { ok: true, session: await startSession(token, personName, unitId) };
  } catch (err: any) {
    console.error("[lead-capture] startCaptureSession:", err?.message);
    return { ok: false, error: err?.message || "Não foi possível iniciar a conexão." };
  }
}

export async function getCaptureSessionStatus({
  token,
  sessionId,
}: {
  token: string;
  sessionId: string;
}): Promise<{ ok: true; session: CaptureSessionView } | { ok: false; error: string }> {
  try {
    return { ok: true, session: await getSessionStatus(token, sessionId) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Falha ao consultar a conexão." };
  }
}
