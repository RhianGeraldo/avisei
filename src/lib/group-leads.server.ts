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

const CHUNK_SIZE = 500;

/**
 * Upsert em lote via função SQL `upsert_group_contacts`:
 * - contatos novos são inseridos
 * - contatos existentes recebem o grupo (se ainda não tiverem) e unit_id/name se vazios
 */
export async function upsertGroupContacts(params: {
  companyId: string;
  unitId: string | null;
  group: GroupOrigin;
  contacts: GroupContact[];
}): Promise<{ inserted: number; updated: number }> {
  const { companyId, unitId, group, contacts } = params;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE).map((c) => ({
      number: c.number,
      name: c.name,
      groups: [group],
    }));

    const { data, error } = await supabaseAdmin.rpc("upsert_group_contacts", {
      p_company_id: companyId,
      p_unit_id: unitId,
      p_contacts: chunk,
    });
    if (error) throw new Error(`Erro ao gravar leads: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    inserted += row?.inserted ?? 0;
    updated += row?.updated ?? 0;
  }

  return { inserted, updated };
}
