"use server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function slugify(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadEvogoSettings() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token, evogo_proxy")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar configurações: ${error.message}`);
  if (!data?.evogo_url || !data?.evogo_admin_token) {
    throw new Error("URL ou Token do Evogo não configurados em app_settings");
  }
  
  return { 
    url: data.evogo_url.replace(/\/+$/, ""), 
    adminToken: data.evogo_admin_token, 
    proxy: data.evogo_proxy ?? null 
  };
}

async function evogoFetch(path: string, opts: { url: string; apikey: string; method: string; body?: unknown }) {
  const fullUrl = `${opts.url}${path}`;
  console.log(`[evogo] Chamando: ${opts.method} ${fullUrl}`);
  
  try {
    const res = await fetch(fullUrl, {
      method: opts.method,
      headers: { 
        "Content-Type": "application/json", 
        "apikey": opts.apikey 
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Sem corpo de erro");
      console.error(`[evogo] Erro na API (${res.status}):`, errorBody);
      throw new Error(`Erro na API EvoGo: ${res.status} - ${errorBody}`);
    }
    
    return res.json().catch(() => ({}));
  } catch (err: any) {
    console.error(`[evogo] Falha na requisição para ${fullUrl}:`, err.message);
    throw err;
  }
}

export async function createEvogoInstance({ data }: { data: any }) {
  const { url, adminToken, proxy } = await loadEvogoSettings();
  
  let { companyId, unitId } = data;

  if (!companyId && unitId) {
    const { data: unitData } = await supabaseAdmin.from("units").select("company_id").eq("id", unitId).single();
    if (unitData) companyId = unitData.company_id;
  }

  const { data: company } = await supabaseAdmin.from("companies").select("name").eq("id", companyId).single();
  
  let unitName = "";
  if (unitId) {
    const { data: unit } = await supabaseAdmin.from("units").select("name").eq("id", unitId).single();
    unitName = unit?.name || "";
  }
    
  const companyPrefix = company ? slugify(company.name) : "instancia";
  const unitSegment = unitName ? slugify(unitName) : "";
  const nameSlug = slugify(data.name);
  
  const instanceName = unitSegment 
    ? `${companyPrefix}-${unitSegment}-${nameSlug}`
    : `${companyPrefix}-${nameSlug}`;

  const instanceToken = crypto.randomUUID().replace(/-/g, "");

  // Create Instance (Doc: POST /instance/create)
  const created = await evogoFetch("/instance/create", {
    url,
    apikey: adminToken,
    method: "POST",
    body: { name: instanceName, token: instanceToken }
  });

  const { data: row, error } = await supabaseAdmin.from("instances").insert({
    unit_id: unitId || null,
    company_id: companyId,
    name: data.name,
    instance_name: instanceName,
    evogo_instance_id: created.data?.id || created.id,
    evogo_api_key: instanceToken,
    status: "disconnected",
  }).select("id").single();

  if (error) throw error;

  const qrCode = created.data?.qrcode || created.data?.Code || created.qrcode?.base64 || created.base64;
  const qrBase64 = qrCode && (qrCode.startsWith("data:") || qrCode.length > 500)
    ? qrCode
    : qrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(qrCode)}` : null;

  return { 
    success: true, 
    id: row.id, 
    instanceName, 
    qrBase64
  };
}

export async function fetchEvogoQrCode({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");

  try {
    // Get QR (Doc: GET /instance/qr)
    const res = await evogoFetch("/instance/qr", {
      url,
      apikey: inst.evogo_api_key,
      method: "GET"
    });
    
    const qrCode = res.data?.qrcode || res.data?.Code || res.qrcode?.base64 || res.base64;
    const qrBase64 = qrCode && (qrCode.startsWith("data:") || qrCode.length > 500)
      ? qrCode
      : qrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(qrCode)}` : null;

    return { 
      qrBase64,
      connected: res.connected || res.data?.Connected || res.Connected || false
    };
  } catch (error: any) {
    // Se a sessão já estiver logada, retornamos como conectado
    if (error.message?.includes("already logged in")) {
      return { qrBase64: null, connected: true };
    }
    // Se o QR ainda não estiver pronto, retornamos silenciando o erro para o polling continuar
    if (error.message?.includes("no QR code available")) {
      return { qrBase64: null, connected: false };
    }
    throw error;
  }
}

export async function fetchEvogoStatus({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");

  // Get Status (Doc: GET /instance/status)
  const res = await evogoFetch("/instance/status", {
    url,
    apikey: inst.evogo_api_key,
    method: "GET"
  });
  
  // Normalização para o padrão do App
  const isConnected = res.data?.Connected || res.Connected;
  const isLoggedIn = res.data?.LoggedIn || res.LoggedIn;
  const name = res.data?.Name || res.Name;
  
  const status = (isConnected && (isLoggedIn || (name && name !== ""))) ? "connected" : "disconnected";
  
  const normalized = {
    ...res,
    status: status,
    state: status,
    connected: isConnected && isLoggedIn
  };

  // Atualizar o status no banco de dados se tivermos o ID da instância
  if (data.instanceId) {
    await supabaseAdmin
      .from("instances")
      .update({ status: status as any })
      .eq("id", data.instanceId);
  }

  console.log(`[evogo] Resposta Normalizada:`, JSON.stringify(normalized));
  return normalized;
}

export async function logoutEvogoInstance({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");

  // Logout (Doc: DELETE /instance/logout)
  await evogoFetch("/instance/logout", {
    url,
    apikey: inst.evogo_api_key,
    method: "DELETE"
  });

  // Atualizar o status no banco de dados
  if (data.instanceId) {
    await supabaseAdmin
      .from("instances")
      .update({ status: "disconnected" as any })
      .eq("id", data.instanceId);
  }

  return { success: true };
}

export async function deleteEvogoInstance({ data }: { data: any }) {
  const { url, adminToken } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_instance_id, instance_name").eq("id", data.instanceId).maybeSingle();
  
  if (inst) {
    const targetId = inst.evogo_instance_id || inst.instance_name;
    try {
      // Delete Instance (Doc: DELETE /instance/delete/:instanceId)
      await evogoFetch(`/instance/delete/${targetId}`, { 
        url, 
        apikey: adminToken, 
        method: "DELETE" 
      });
    } catch (e) {
      console.warn("Erro ao deletar no EvoGo (provavelmente já não existia):", e);
    }
  }

  await supabaseAdmin.from("instances").delete().eq("id", data.instanceId);
  return { success: true };
}

export async function fetchEvogoFullSettings({ data }: { data: any }) {
  const { url, adminToken } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_instance_id").eq("id", data.instanceId).maybeSingle();
  if (!inst?.evogo_instance_id) throw new Error("ID da instância não encontrado. Tente atualizar o status ou reconectar.");

  const res = await evogoFetch(`/instance/info/${inst.evogo_instance_id}`, {
    url,
    apikey: adminToken,
    method: "GET"
  });
  
  return res.data || res;
}

export async function updateEvogoConnectionSettings({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_instance_id, evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst?.evogo_instance_id) throw new Error("ID da instância não encontrado.");

  // Doc: POST /instance/connect
  await evogoFetch("/instance/connect", {
    url,
    apikey: inst.evogo_api_key,
    method: "POST",
    body: data.settings
  });
  
  return { success: true };
}

export async function fetchEvogoAdvancedSettings({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_instance_id, evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");
  if (!inst.evogo_instance_id) throw new Error("ID da instância EvoGo não encontrado. Reconnecte ou atualize o status.");

  // Get Advanced Settings (Doc: GET /instance/:instanceId/advanced-settings)
  const res = await evogoFetch(`/instance/${inst.evogo_instance_id}/advanced-settings`, {
    url,
    apikey: inst.evogo_api_key,
    method: "GET"
  });
  return res.data || res;
}

export async function updateEvogoAdvancedSettings({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_instance_id, evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");
  if (!inst.evogo_instance_id) throw new Error("ID da instância EvoGo não encontrado.");

  // Update Advanced Settings (Doc: PUT /instance/:instanceId/advanced-settings)
  await evogoFetch(`/instance/${inst.evogo_instance_id}/advanced-settings`, {
    url,
    apikey: inst.evogo_api_key,
    method: "PUT",
    body: data.settings
  });
  return { success: true };
}

export async function updateEvogoWebhook({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");

  // Instance Connect (Doc: POST /instance/connect) - This is where we set the webhook
  await evogoFetch("/instance/connect", {
    url,
    apikey: inst.evogo_api_key,
    method: "POST",
    body: {
      subscribe: ["ALL"],
      webhookUrl: data.webhookUrl
    }
  });
  
  await supabaseAdmin.from("instances").update({ webhook_url: data.webhookUrl }).eq("id", data.instanceId);
  return { success: true };
}

export async function evogoSendGeneric(url: string, apikey: string, number: string, text: string, type: string = "text", contentData: any = {}) {
  let formattedNumber = String(number).replace(/\D/g, "");
  // Se for um número brasileiro com DDD (10 ou 11 dígitos), adiciona o DDI 55
  if (formattedNumber.length === 10 || formattedNumber.length === 11) {
    formattedNumber = `55${formattedNumber}`;
  }

  let path = "/send/text";
  let body: any = { number: formattedNumber, text, delay: 1000 };

  if (type === "media") {
    path = "/send/media";
    const mediaType = contentData?.mediaType || "image";
    
    // EvoGo API SEMPRE exige filename, senão retorna 400
    // Se for imagem, precisamos de uma extensão válida (.jpg, .png) senão o WhatsApp pode enviar como documento
    let fallbackExt = "bin";
    if (mediaType === "image") fallbackExt = "jpg";
    if (mediaType === "video") fallbackExt = "mp4";
    if (mediaType === "audio") fallbackExt = "mp3";
    
    body = {
      number: formattedNumber,
      url: contentData?.url,
      type: mediaType,
      caption: text,
      delay: 1000,
      filename: contentData?.filename || `file-${Date.now()}.${fallbackExt}`,
    };
  } else if (type === "poll") {
    path = "/send/poll";
    body = {
      number: formattedNumber,
      name: contentData?.pollName || "Enquete",
      options: contentData?.pollOptions || contentData?.options || [],
      selectableCount: contentData?.selectableCount || 1
    };
  } else if (type === "button") {
    path = "/send/button";
    body = {
      number: formattedNumber,
      title: contentData?.title || " ", // EvoGo requires title. Use a space if empty to avoid 400.
      description: text,
      footer: contentData?.footer || " ", // Also apply to footer just in case
      buttons: contentData?.buttons || [],
      delay: 1000
    };
  }

  // Send (Doc: POST /send/text etc)
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": apikey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Erro no envio: ${res.status} - ${errorBody}`);
  }
  return res.json();
}

export async function sendEvogoMessage({ data }: { data: any }) {
  // Simplesmente redireciona para o sendEvogoText que agora tem logging completo
  return sendEvogoText({ data });
}

export async function dispatchSendQueueItem({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: item } = await supabaseAdmin
    .from("send_queue")
    .select("*, instances(evogo_api_key)")
    .eq("id", data.itemId)
    .single();

  if (!item) throw new Error("Item da fila não encontrado");
  if (!item.instances?.evogo_api_key) throw new Error("Chave da instância não encontrada");

  const result = await evogoSendGeneric(url, item.instances.evogo_api_key, item.number, item.text, item.message_type, item.content_data);
  
  await supabaseAdmin.from("send_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", data.itemId);
  
  return result;
}

export async function cancelSendQueueItem({ data }: { data: any }) {
  const { error } = await supabaseAdmin
    .from("send_queue")
    .update({ status: "cancelled" })
    .eq("id", data.itemId);
    
  if (error) throw error;
  return { success: true };
}

export async function runCronJobNow({ data }: { data: any }) {
  const { runCronTick } = await import("./cron");
  return runCronTick({ onlyJobId: data.cronJobId, skipShouldRun: true });
}

export async function processQueueNow() {
  const { runCronTick } = await import("./cron");
  return runCronTick();
}

export async function sendEvogoText({ data }: { data: any }) {
  const { url } = await loadEvogoSettings();
  const { data: inst } = await supabaseAdmin.from("instances").select("evogo_api_key").eq("id", data.instanceId).maybeSingle();
  if (!inst) throw new Error("Instância não encontrada");

  let success = false;
  let errorMsg = null;
  let result = null;

  const msgType = data.message_type || data.messageType || "text";
  const content = data.content_data || {
    url: data.url,
    mediaType: data.mediaType,
    filename: data.filename,
    pollOptions: data.pollOptions,
    options: data.options,
    pollName: data.pollName,
    selectableCount: data.selectableCount,
    title: data.title,
    footer: data.footer,
    buttons: data.buttons
  };

  try {
    result = await evogoSendGeneric(url, inst.evogo_api_key, data.number, data.text, msgType, content);
    success = true;
    return result;
  } catch (err: any) {
    errorMsg = err.message;
    throw err;
  } finally {
    // Gravar no histórico (sempre, sucesso ou erro)
    await supabaseAdmin.from("message_send_logs").insert({
      instance_id: data.instanceId,
      message_id: data.messageId || null,
      number: data.number,
      text: data.text,
      success,
      error: errorMsg,
      trigger_source: data.trigger_source || 'manual',
      message_type: msgType,
      content_data: content
    });
  }
}
