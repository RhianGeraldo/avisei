import { supabaseAdmin as defaultAdmin } from "@/integrations/supabase/client.server";
import { evogoSendGeneric } from "./evogo";
import { fetchBelleAgendamentos, fetchBelleCobrancas, enqueueBelleItems } from "./belle";

let isWorkerRunning = false;

// --- Lógica de Campanha ---
async function checkAndFinalizeCampaign(supabase: any, campaignId: string) {
  const { data: campaign } = await supabase.from("campaigns").select("status, total_contacts, sent_count, failed_count").eq("id", campaignId).single();
  if (!campaign) return;
  const processed = (campaign.sent_count || 0) + (campaign.failed_count || 0);
  const total = campaign.total_contacts || 0;
  if (total > 0 && processed >= total && campaign.status !== 'completed') {
    await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
    await supabase.from("send_queue").delete().eq("campaign_id", campaignId).in("status", ["pending", "paused"]);
  }
}

async function finalizeAllCompletedCampaigns(supabase: any) {
  const { data: campaigns } = await supabase.from("campaigns").select("id").not("status", "in", '("completed","canceled")');
  for (const campaign of campaigns || []) {
    await checkAndFinalizeCampaign(supabase, campaign.id);
  }
}

// --- Lógica de Automação (Cron Jobs) ---
async function processCronJobs(supabase: any, onlyJobId?: string) {
  const now = new Date();
  const currentHour = now.getHours().toString().padStart(2, "0");
  const currentMinute = now.getMinutes().toString().padStart(2, "0");
  const currentTime = `${currentHour}:${currentMinute}`;
  const currentDay = now.getDay();

  console.log(`[cron] Verificando automações para ${currentTime} (Dia ${currentDay})`);

  let query = supabase
    .from("cron_jobs")
    .select("*")
    .eq("active", true);

  if (onlyJobId) {
    query = query.eq("id", onlyJobId);
  } else {
    query = query.eq("schedule_time", currentTime);
  }

  const { data: jobs, error } = await query;
  if (error) return { count: 0, error: error.message };

  let totalProcessed = 0;
  let totalDispatched = 0;

  for (const job of jobs || []) {
    // Verifica se hoje é dia de rodar (apenas se não for execução manual)
    if (!onlyJobId && !job.days_of_week.includes(currentDay)) continue;

    console.log(`[cron] Processando automação: ${job.name || job.id} (Source: ${job.trigger_source})`);

    // Trava para evitar execução duplicada no mesmo minuto
    const lastRun = job.last_run_at ? new Date(job.last_run_at) : null;
    if (lastRun && !onlyJobId) {
      const isSameMinute = 
        lastRun.getFullYear() === now.getFullYear() &&
        lastRun.getMonth() === now.getMonth() &&
        lastRun.getDate() === now.getDate() &&
        lastRun.getHours() === now.getHours() &&
        lastRun.getMinutes() === now.getMinutes();

      if (isSameMinute) {
        console.log(`[cron] Automação ${job.name || job.id} já executada neste minuto. Pulando...`);
        continue;
      }
    }

    const offset = job.days_offset || 0;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + offset);
    const dateStr = targetDate.toISOString().split("T")[0];

    console.log(`[cron] Data alvo da consulta: ${dateStr} (D+${offset})`);

    try {
      const fetchParams = { 
        dtInicio: dateStr, 
        dtFim: dateStr,
        status: job.status_filter,
        tipoAgendamento: job.tipo_filter === 'any' ? null : job.tipo_filter
      };

      const unitIds = job.unit_ids || [];
      for (const unitId of unitIds) {
        let result: any;
        console.log(`[cron] Processando Unidade: ${unitId}`);

        // Decide qual API do Belle chamar
        if (job.trigger_source === "billing") {
          result = await fetchBelleCobrancas({ data: { unitId, ...fetchParams } });
        } else {
          // Default: Agendamento
          result = await fetchBelleAgendamentos({ data: { unitId, ...fetchParams } });
        }

        const itemsToEnqueue = (result.items || [])
          .filter((item: any) => !!item.number)
          .map((item: any) => ({
            ...item,
            messageId: job.message_id,
          }));

        if (itemsToEnqueue.length > 0) {
          const instanceMapping = job.instance_mapping as Record<string, string>;
          const instanceId = instanceMapping?.[unitId] || (job as any).instance_id;

          if (!instanceId) {
            console.error(`[cron] Unidade ${unitId} sem WhatsApp configurado.`);
            continue;
          }

          const enqResult = await enqueueBelleItems({
            data: {
              unitId,
              instanceId,
              items: itemsToEnqueue,
              interval: job.interval_seconds,
            }
          });
          
          totalProcessed += enqResult.count;
          console.log(`[cron] Unidade ${unitId}: ${enqResult.count} mensagens na fila.`);
        }
      }

      await supabase.from("cron_jobs").update({ 
        last_run_at: now.toISOString(),
        last_run_status: "success",
        last_run_count: totalProcessed,
        last_run_error: null
      }).eq("id", job.id);

    } catch (err: any) {
      console.error(`[cron] Erro na automação ${job.id}:`, err.message);
      await supabase.from("cron_jobs").update({ 
        last_run_at: now.toISOString(),
        last_run_status: "error",
        last_run_error: err.message
      }).eq("id", job.id);
    }
  }

  return { count: totalProcessed, dispatched: totalDispatched };
}

// --- Motor Principal (Worker) ---
export async function processSendQueue(supabase: any, evogoUrl: string) {
  const nowStr = new Date().toISOString();
  console.log(`[worker] Buscando e travando itens pendentes concorrentemente até: ${nowStr}`);

  // Reivindica os registros da fila de forma 100% atômica no Postgres
  const { data: queue, error: claimErr } = await supabase.rpc("claim_send_queue_items", {
    limit_val: 20,
    now_str: nowStr
  });

  if (claimErr) {
    console.error("[worker] Erro ao reivindicar mensagens da fila:", claimErr.message);
    return { dispatched: 0 };
  }

  if (!queue || queue.length === 0) return { dispatched: 0 };

  console.log(`[worker] Processando lote seguro de ${queue.length} mensagens agora...`);

  const affectedCampaigns = new Set<string>();
  let dispatched = 0;

  for (const item of queue) {
    const apikey = item.evogo_api_key || (item.instances as any)?.evogo_api_key;
    if (!apikey) continue;

    const numeroLimpo = item.number.replace(/\D/g, "");
    let success = false;
    let errorMsg: string | null = null;

    try {
      console.log(`[worker] Enviando para ${numeroLimpo}...`);
      await evogoSendGeneric(evogoUrl, apikey, numeroLimpo, item.text, item.message_type, item.content_data);
      success = true;
      dispatched++;
      console.log(`[worker] Sucesso: ${numeroLimpo}`);
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Falha ao enviar para ${numeroLimpo}:`, errorMsg);
      
      // Se o erro for de falta de JID do dispositivo, significa que o WhatsApp desconectou
      if (errorMsg.includes("the store doesn't contain a device JID") && item.campaign_id) {
        console.log(`[worker] Detectada desconexão do WhatsApp. Pausando campanha ${item.campaign_id}`);
        await supabase.from("campaigns").update({ status: "paused" }).eq("id", item.campaign_id);
        await supabase.from("send_queue").update({ status: "paused" }).eq("campaign_id", item.campaign_id).eq("status", "pending");
      }
    }

    // Log e Atualização
    const { error: logErr } = await supabase.from("message_send_logs").insert({ 
      instance_id: item.instance_id, 
      message_id: item.message_id, 
      number: numeroLimpo, 
      text: item.text, 
      success, 
      error: errorMsg,
      trigger_source: item.trigger_source || 'manual',
      message_type: item.message_type || 'text',
      content_data: item.content_data
    });
    if (logErr) console.error("[worker] Erro ao gravar log de envio:", logErr);
    if (item.contact_id) {
      await supabase.from("campaign_contacts").update({ status: success ? "sent" : "failed", sent_at: new Date().toISOString(), error: errorMsg }).eq("id", item.contact_id);
    }
    await supabase.from("send_queue").update({ status: success ? "sent" : "failed", last_error: errorMsg }).eq("id", item.id);
    if (item.campaign_id) {
      affectedCampaigns.add(item.campaign_id);
      await supabase.rpc(success ? 'increment_campaign_sent' : 'increment_campaign_failed', { campaign_id_param: item.campaign_id });
    }
  }

  for (const campaignId of affectedCampaigns) {
    await checkAndFinalizeCampaign(supabase, campaignId);
  }

  return { dispatched };
}

export async function runCronTick(opts?: { onlyJobId?: string, skipShouldRun?: boolean }): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // 1. Processar Automações (Popular Fila)
  const cronResults = await processCronJobs(supabaseAdmin, opts?.onlyJobId);

  // 2. Processar Fila de Envio (Worker)
  if (isWorkerRunning) return { success: true, ...cronResults, worker: "already running" };

  const { data: settings } = await supabaseAdmin.from("app_settings").select("evogo_url").eq("id", true).maybeSingle();
  if (!settings?.evogo_url) return { success: false, error: "Config missing" };
  const evogoUrl = settings.evogo_url.replace(/\/+$/, "");

  (async () => {
    isWorkerRunning = true;
    while (isWorkerRunning) {
      try {
        const { dispatched } = await processSendQueue(supabaseAdmin, evogoUrl);
        
        // Verificar se ainda há algo para processar AGORA ou se há algo nulo
        const { count } = await supabaseAdmin
          .from("send_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .or(`scheduled_at.lte.${new Date().toISOString()},scheduled_at.is.null`);
        
        if (count === 0) {
          // Se não há nada para agora, verificamos se há algo para o futuro
          const { count: futureCount } = await supabaseAdmin
            .from("send_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .limit(1);

          if (futureCount === 0) {
            await finalizeAllCompletedCampaigns(supabaseAdmin);
            isWorkerRunning = false;
            break;
          }
          await finalizeAllCompletedCampaigns(supabaseAdmin);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (err) {
        console.error("[worker] Erro:", err);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  })();

  return { success: true, ...cronResults };
}
