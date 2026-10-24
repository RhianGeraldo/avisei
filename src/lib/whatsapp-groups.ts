// Helpers puros (sem dependências de servidor) para interpretar as respostas
// de grupos/participantes da API EvoGo (whatsmeow). Usados no frontend e no backend.

export type NormalizedGroup = {
  jid: string;
  name: string;
  participants?: unknown[];
};

export type GroupContact = {
  number: string;
  name: string | null;
};

/** Extrai o JID do grupo, independentemente do formato retornado pela API. */
export function getGroupJid(group: any): string | null {
  if (!group) return null;
  if (typeof group.JID === "string") return group.JID;
  if (typeof group.jid === "string") return group.jid;
  if (typeof group.id === "string") return group.id;
  if (typeof group.id?._serialized === "string") return group.id._serialized;
  return null;
}

export function getGroupName(group: any): string {
  return group?.Name || group?.subject || group?.name || "Grupo sem nome";
}

export function getGroupParticipants(group: any): unknown[] | undefined {
  const list =
    group?.Participants ??
    group?.participants ??
    group?.data?.Participants ??
    group?.data?.participants;
  return Array.isArray(list) ? list : undefined;
}

/** Normaliza a resposta de GET /group/list em uma lista de grupos válidos (@g.us). */
export function normalizeGroupList(raw: any): NormalizedGroup[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.groups)
        ? raw.groups
        : [];
  const seen = new Set<string>();
  const result: NormalizedGroup[] = [];

  for (const g of list) {
    const jid = getGroupJid(g);
    // Aceita apenas grupos reais do WhatsApp (terminam em @g.us)
    // Ignora canais/newsletters (@newsletter), listas de transmissão (@broadcast) e contatos individuais
    if (!jid || !jid.endsWith("@g.us") || seen.has(jid)) continue;
    seen.add(jid);
    result.push({ jid, name: getGroupName(g), participants: getGroupParticipants(g) });
  }
  return result;
}

/**
 * Extrai o telefone real de um participante.
 * O WhatsApp pode identificar participantes por LID (ex: "123456@lid"), que NÃO é um
 * telefone. Nesse caso tentamos o campo PhoneNumber; se não houver, retornamos null.
 */
export function extractParticipantPhone(p: any): string | null {
  const candidates: unknown[] =
    typeof p === "string" ? [p] : [p?.PhoneNumber, p?.phoneNumber, p?.JID, p?.jid, p?.Jid, p?.id];

  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    const c = String(raw).trim();
    if (!c) continue;
    const [userPart, server = "s.whatsapp.net"] = c.split("@");
    if (server !== "s.whatsapp.net" && server !== "c.us") continue; // ignora @lid, @g.us etc.
    const digits = userPart.split(":")[0].replace(/\D/g, ""); // remove sufixo de device ":12"
    if (digits.length >= 10 && digits.length <= 15) return digits;
  }
  return null;
}

export function extractParticipantName(p: any): string | null {
  if (!p || typeof p !== "object") return null;
  const name = p.DisplayName || p.ContactName || p.PushName || p.name || p.notify;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function isParticipantAdmin(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  return !!(
    p.IsAdmin ||
    p.IsSuperAdmin ||
    p.isAdmin ||
    p.admin === "admin" ||
    p.admin === "superadmin"
  );
}

/**
 * Gera variações de números com e sem o 9º dígito para telefones celulares do Brasil.
 */
export function expandPhoneVariations(phone: string): string[] {
  const clean = phone.replace(/\D/g, "");
  const variations = new Set<string>([clean]);
  // Números do Brasil: DDI 55 + DDD 2 dígitos (11-99)
  if (clean.startsWith("55") && clean.length === 13) {
    // 55 + DD + 9XXXXXXXX -> remove o 9 (12 dígitos)
    const withoutNine = clean.slice(0, 4) + clean.slice(5);
    variations.add(withoutNine);
  } else if (clean.startsWith("55") && clean.length === 12) {
    // 55 + DD + XXXXXXXX -> adiciona o 9 (13 dígitos)
    const withNine = clean.slice(0, 4) + "9" + clean.slice(4);
    variations.add(withNine);
  }
  return Array.from(variations);
}

/**
 * Converte participantes em contatos válidos (com telefone), removendo duplicados
 * e números a ignorar (ex: o próprio dono do WhatsApp, cobrindo variações do 9º dígito).
 */
export function participantsToContacts(
  participants: unknown[],
  ignoreNumbers: string[] = [],
): { contacts: GroupContact[]; skippedWithoutPhone: number } {
  const ignore = new Set(
    ignoreNumbers.filter(Boolean).flatMap((num) => expandPhoneVariations(num)),
  );
  const byNumber = new Map<string, GroupContact>();
  let skippedWithoutPhone = 0;

  for (const p of participants) {
    const number = extractParticipantPhone(p);
    if (!number) {
      skippedWithoutPhone++;
      continue;
    }
    if (ignore.has(number)) continue;
    const name = extractParticipantName(p);
    const existing = byNumber.get(number);
    if (!existing) byNumber.set(number, { number, name });
    else if (!existing.name && name) existing.name = name;
  }

  return { contacts: [...byNumber.values()], skippedWithoutPhone };
}
