import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { participantsToContacts } from "@/lib/whatsapp-groups";
import { upsertGroupContacts } from "@/lib/group-leads.server";

/**
 * Importa participantes de um grupo como leads (página /groups).
 * Requer `Authorization: Bearer <access_token do Supabase>`.
 * A empresa é sempre derivada do usuário autenticado (super_admin: da unidade).
 */
export async function POST(req: Request) {
  try {
    // 1. Autenticação
    const accessToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const { data: authData, error: authError } =
      await supabaseAdmin.client.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
    }
    const userId = authData.user.id;

    // 2. Validação do body
    const body = await req.json();
    const { unitId, groupName, groupJid, participants } = body;

    if (!unitId || !groupName || !groupJid || !participants) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!Array.isArray(participants)) {
      return NextResponse.json({ error: "Participants must be an array" }, { status: 400 });
    }

    // 3. Autorização: a unidade precisa pertencer à empresa do usuário
    const [{ data: unit }, { data: profile }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("units").select("company_id").eq("id", unitId).maybeSingle(),
      supabaseAdmin.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (!unit?.company_id) {
      return NextResponse.json({ error: "Unidade não encontrada" }, { status: 400 });
    }
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin && unit.company_id !== profile?.company_id) {
      return NextResponse.json({ error: "Sem permissão para esta unidade" }, { status: 403 });
    }

    // 4. Importação (descarta participantes sem telefone real, ex: @lid)
    const { contacts, skippedWithoutPhone } = participantsToContacts(participants);
    const { inserted, updated } = await upsertGroupContacts({
      companyId: unit.company_id,
      unitId,
      contacts,
      group: {
        jid: groupJid,
        name: groupName,
        imported_at: new Date().toISOString(),
        source: "manual",
      },
    });

    return NextResponse.json({
      success: true,
      stats: { inserted, updated, failed: 0, skipped: skippedWithoutPhone },
    });
  } catch (error: any) {
    console.error("Import contacts error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
