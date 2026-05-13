import { substituirVariaveis, substituirVariaveisDeep } from "./utils";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function launchCampaign(campaignId: string) {
  console.log(`[launchCampaign] Iniciando disparo para ID: ${campaignId}`);

  // 1. Buscar detalhes da campanha
  const { data: campaign, error: cErr } = await supabaseAdmin
    .from("campaigns")
    .select("*, messages(template, message_type, content_data), instances(name, status)")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    throw new Error("Campanha não encontrada");
  }

  const instance = campaign.instances as any;
  const instanceStatus = instance?.status || "disconnected";

  // 2. Verificar o status local
  if (instanceStatus !== "connected") {
    throw new Error(`A instância "${instance?.name || 'Desconhecida'}" não está conectada no sistema.`);
  }

  // 3. Buscar contatos
  const { data: contacts, error: coErr } = await supabaseAdmin
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (coErr) throw new Error("Erro ao buscar contatos");
  if (!contacts || contacts.length === 0) throw new Error("Nenhum contato pendente nesta campanha");

  const templateData = campaign.messages as any;
  const template = templateData.template;
  const messageType = templateData.message_type;
  const contentData = templateData.content_data;
  const interval = campaign.interval_seconds;
  const now = new Date();

  // 4. Preparar itens na fila (Tentativa com contact_id)
  const queueItems = contacts.map((contact, index) => {
    const vars = {
      ...(contact.variables as any),
      nome: contact.name || "",
      p_nome: contact.name?.trim().split(/\s+/)[0] || contact.name || "",
    };

    const text = substituirVariaveis(template, vars);
    const resolvedContentData = substituirVariaveisDeep(contentData, vars);
    const scheduledAt = new Date(now.getTime() + (index * interval * 1000) + (Math.random() * 2000));

    return {
      campaign_id: campaignId,
      contact_id: contact.id, // Vínculo original
      company_id: campaign.company_id,
      unit_id: campaign.unit_id,
      instance_id: campaign.instance_id,
      message_id: campaign.message_id,
      number: contact.number.replace(/\D/g, ""),
      text: text,
      message_type: messageType,
      content_data: resolvedContentData,
      status: "pending" as const,
      scheduled_at: scheduledAt.toISOString(),
    };
  });

  // 5. Inserir na fila (Com tratamento de erro de cache)
  const { error: insErr } = await supabaseAdmin.from("send_queue").insert(queueItems);
  
  if (insErr) {
    console.warn("[launchCampaign] Erro ao inserir com contact_id (provável cache). Tentando sem a coluna...");
    
    // Se falhar por causa da coluna contact_id, tentamos sem ela
    const safeQueueItems = queueItems.map(({ contact_id, ...rest }) => rest);
    const { error: insErrSafe } = await supabaseAdmin.from("send_queue").insert(safeQueueItems);
    
    if (insErrSafe) {
      throw new Error(`Erro ao popular fila (mesmo sem contact_id): ${insErrSafe.message}`);
    }
  }

  // 6. Atualizar status da campanha
  await supabaseAdmin.from("campaigns").update({ 
    status: "running",
    total_contacts: contacts.length,
    scheduled_at: now.toISOString()
  }).eq("id", campaignId);

  // 7. Marcar contatos
  await supabaseAdmin.from("campaign_contacts").update({ status: "sent" }).eq("campaign_id", campaignId);

  // 8. Gatilho imediato
  const { runCronTick } = await import("./cron");
  runCronTick({ skipShouldRun: true }).catch(err => {
    console.error("[launchCampaign] Erro ao iniciar processamento da fila:", err);
  });

  return { success: true, count: contacts.length };
}

export async function pauseCampaign(campaignId: string) {
  await supabaseAdmin.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
  await supabaseAdmin.from("send_queue").update({ status: "paused" }).eq("campaign_id", campaignId).eq("status", "pending");
  return { success: true };
}

export async function resumeCampaign(campaignId: string) {
  await supabaseAdmin.from("campaigns").update({ status: "running" }).eq("id", campaignId);
  await supabaseAdmin.from("send_queue").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "paused");
  const { runCronTick } = await import("./cron");
  runCronTick({ skipShouldRun: true }).catch(e => console.error(e));
  return { success: true };
}
