// Server-only: grava contatos vindos de grupos do WhatsApp na tabela `contacts`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GroupContact } from "@/lib/whatsapp-groups";

export type GroupOrigin = {
  jid: string;
  name: string;
  imported_at: string;
  source: "manual" | "capture_link";
  captured_by?: string;
  unit_id?: string | null;
  unit_name?: string | null;
  capture_session_id?: string;
};

const CHUNK_SIZE = 150;

/**
 * Upsert em lote direto via Supabase client:
 * - Deduplica contatos da lista de entrada por número
 * - Busca registros existentes por (company_id, number)
 * - Novos contatos são inseridos com o grupo
 * - Contatos existentes recebem o novo grupo no array JSONB (sem duplicar JID)
 * - Preenche unit_id e name se ainda não estavam definidos
 */
export async function upsertGroupContacts(params: {
  companyId: string;
  unitId: string | null;
  group: GroupOrigin;
  contacts: GroupContact[];
}): Promise<{ inserted: number; updated: number }> {
  const { companyId, unitId, group, contacts } = params;

  if (!contacts || contacts.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // 1. Deduplica contatos recebidos por número
  const dedupedMap = new Map<string, GroupContact>();
  for (const c of contacts) {
    if (!c.number) continue;
    const existing = dedupedMap.get(c.number);
    if (!existing) {
      dedupedMap.set(c.number, c);
    } else if (!existing.name && c.name) {
      dedupedMap.set(c.number, c);
    }
  }

  const list = Array.from(dedupedMap.values());
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE);
    const numbers = chunk.map((c) => c.number);

    // 2. Busca contatos que já existem nessa empresa
    const { data: existingRows, error: selectErr } = await supabaseAdmin
      .from("contacts")
      .select("id, number, name, unit_id, groups")
      .eq("company_id", companyId)
      .in("number", numbers);

    if (selectErr) {
      throw new Error(`Erro ao consultar leads existentes: ${selectErr.message}`);
    }

    const existingMap = new Map<string, any>(
      (existingRows ?? []).map((row: any) => [row.number, row]),
    );

    const now = new Date().toISOString();
    const toUpsert: any[] = [];

    for (const c of chunk) {
      const existing = existingMap.get(c.number);

      if (existing) {
        updated++;
        const currentGroups: any[] = Array.isArray(existing.groups) ? existing.groups : [];
        const hasGroup = currentGroups.some((g: any) => g?.jid === group.jid);
        const mergedGroups = hasGroup ? currentGroups : [...currentGroups, group];

        toUpsert.push({
          company_id: companyId,
          number: c.number,
          name: existing.name || c.name || null,
          unit_id: existing.unit_id || unitId || null,
          groups: mergedGroups,
          updated_at: now,
        });
      } else {
        inserted++;
        toUpsert.push({
          company_id: companyId,
          number: c.number,
          name: c.name || null,
          unit_id: unitId || null,
          groups: [group],
          created_at: now,
          updated_at: now,
        });
      }
    }

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("contacts")
        .upsert(toUpsert, { onConflict: "company_id,number" });

      if (upsertErr) {
        throw new Error(`Erro ao gravar leads no banco: ${upsertErr.message}`);
      }
    }
  }

  return { inserted, updated };
}
