'use server'
import { runCronTick } from "@/lib/cron";

export async function triggerCampaignWorker() {
  console.log("[actions] Disparando worker de campanha manualmente...");
  try {
    const result = await runCronTick();
    return { success: true, result };
  } catch (err: any) {
    console.error("[actions] Erro ao disparar worker:", err.message);
    return { success: false, error: err.message };
  }
}

export async function startCampaignServer(campaignId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  try {
    // 1. Buscar detalhes da campanha
    const { data: c, error: cErr } = await supabaseAdmin
      .from("campaigns")
      .select("*, messages(template)")
      .eq("id", campaignId)
      .single();
    
    if (cErr || !c) throw new Error("Campanha não encontrada");
    if (c.status === 'completed') throw new Error("Campanha já finalizada");

    // 2. Buscar contatos pendentes
    const { data: contacts, error: coErr } = await supabaseAdmin
      .from("campaign_contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");
    
    if (coErr || !contacts || contacts.length === 0) {
      throw new Error("Nenhum contato pendente encontrado");
    }

    // 3. Preparar itens da fila
    const interval = c.interval_seconds || 30;
    const startTime = new Date();
    const template = (c.messages as any)?.template || "";

    const queueItems = contacts.map((contact, i) => ({
      company_id: c.company_id,
      unit_id: c.unit_id,
      instance_id: c.instance_id,
      message_id: c.message_id,
      contact_id: contact.id,
      campaign_id: c.id,
      number: contact.number.replace(/\D/g, ""),
      text: template,
      status: "pending",
      scheduled_at: new Date(startTime.getTime() + (i * interval * 1000)).toISOString(),
      trigger_source: "campaign"
    }));

    // 4. Inserir na fila (Admin bypassa RLS)
    const { error: insErr } = await supabaseAdmin.from("send_queue").insert(queueItems);
    if (insErr) throw insErr;

    // 5. Atualizar status da campanha
    await supabaseAdmin.from("campaigns").update({ status: "running" }).eq("id", campaignId);

    // 6. Acordar worker
    await runCronTick();

    return { success: true, count: queueItems.length };
  } catch (err: any) {
    console.error("[actions] Erro ao iniciar campanha:", err.message);
    return { success: false, error: err.message };
  }
}
