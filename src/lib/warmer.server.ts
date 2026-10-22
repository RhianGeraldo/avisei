// Server-only: Motor de Aquecimento e Maturação de Chips do WhatsApp (Estilo MaturaGo)
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WarmerStatus = "disconnected" | "connecting" | "idle" | "warming" | "paused" | "banned" | "graduated";

export type WarmerSettings = {
  daily_limit_min: number;
  daily_limit_max: number;
  start_hour: number;
  end_hour: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  max_turns_per_dialog: number;
  enable_groups: boolean;
  enable_status: boolean;
};

const DEFAULT_SETTINGS: WarmerSettings = {
  daily_limit_min: 10,
  daily_limit_max: 80,
  start_hour: 8,
  end_hour: 21,
  min_delay_seconds: 60,
  max_delay_seconds: 180,
  max_turns_per_dialog: 4,
  enable_groups: true,
  enable_status: true,
};

// =====================================================================
// 1. Configurações e Comunicação com o EvoGo
// =====================================================================

async function loadEvogoSettings() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .maybeSingle();

  if (error || !data?.evogo_url || !data?.evogo_admin_token) {
    throw new Error("EvoGo URL ou Admin Token não configurados em app_settings.");
  }

  return {
    url: data.evogo_url.replace(/\/+$/, ""),
    adminToken: data.evogo_admin_token,
  };
}

async function evogoRequest(
  path: string,
  options: {
    method?: string;
    apiKey?: string;
    body?: any;
    timeoutMs?: number;
  } = {}
) {
  const { url, adminToken } = await loadEvogoSettings();
  const targetUrl = `${url}${path}`;
  const apiKey = options.apiKey || adminToken;
  const method = options.method || "GET";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    const res = await fetch(targetUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      throw new Error(`EvoGo ${path} (${res.status}): ${json?.error || json?.message || text}`);
    }

    return json;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

// =====================================================================
// 2. Gerenciamento de Números / Instâncias do Aquecedor
// =====================================================================

async function fetchChipProfile(
  evogoInstanceId: string,
  evogoApiKey: string,
  hintStatusName?: string | null
) {
  let phone: string | null = null;
  let profileName: string | null =
    hintStatusName && typeof hintStatusName === "string" && !hintStatusName.startsWith("warmer-")
      ? hintStatusName.trim()
      : null;
  let profilePicUrl: string | null = null;

  // 1. Se ainda não temos o nome real do perfil, checa /instance/status primeiro (o whatsmeow retorna o pushName em data.Name)
  if (!profileName) {
    try {
      const statusRes = await evogoRequest("/instance/status", {
        method: "GET",
        apiKey: evogoApiKey,
        timeoutMs: 4000,
      });
      const sName = statusRes?.data?.Name || statusRes?.Name;
      if (sName && typeof sName === "string" && !sName.startsWith("warmer-")) {
        profileName = sName.trim();
      }
    } catch {
      // Ignora erro de status
    }
  }

  // 2. Busca JID e configurações no /instance/info
  try {
    let infoRes: any;
    try {
      infoRes = await evogoRequest(`/instance/info/${evogoInstanceId}`, {
        method: "GET",
        timeoutMs: 5000,
      });
    } catch {
      infoRes = await evogoRequest(`/instance/info/${evogoInstanceId}`, {
        method: "GET",
        apiKey: evogoApiKey,
        timeoutMs: 5000,
      });
    }

    const inst = infoRes?.instance || infoRes?.data || infoRes;
    const jid = inst?.ownerJid || inst?.owner || inst?.jid || inst?.JID || inst?.wid || "";
    if (jid) {
      phone = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
    }
    if (!phone && (inst?.phone || inst?.Phone)) {
      phone = String(inst.phone || inst.Phone).replace(/\D/g, "");
    }

    // Se ainda não temos profileName, verifica profileName ou pushName (NUNCA inst.name pois é o nome técnico da instância)
    if (!profileName) {
      const pName = inst?.profileName || inst?.pushName || inst?.notify || null;
      if (pName && typeof pName === "string" && !pName.startsWith("warmer-")) {
        profileName = pName.trim();
      }
    }

    const rawPic = inst?.profilePicUrl || inst?.profilePictureUrl || inst?.avatar || inst?.picture || null;
    if (rawPic && typeof rawPic === "string" && rawPic.startsWith("http")) {
      profilePicUrl = rawPic;
    }
  } catch (err) {
    console.warn("[warmer] Erro ao buscar /instance/info:", err);
  }

  // 3. Busca foto de perfil via /user/avatar com { number: `${phone}@s.whatsapp.net`, preview: true }
  if (phone && !profilePicUrl) {
    try {
      const jidTarget = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
      const avatarRes = await evogoRequest("/user/avatar", {
        method: "POST",
        apiKey: evogoApiKey,
        body: { number: jidTarget, preview: true },
        timeoutMs: 4000,
      });
      const url =
        avatarRes?.data?.url ||
        avatarRes?.url ||
        avatarRes?.data?.profilePictureUrl ||
        avatarRes?.profilePicUrl;
      if (url && typeof url === "string" && url.startsWith("http")) {
        profilePicUrl = url;
      }
    } catch (e) {
      // Ignora erro de avatar
    }
  }

  return { phone, profileName, profilePicUrl };
}

export async function createWarmerNumber(companyId?: string | null, name: string = "") {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe um nome para identificar o chip.");

  let targetCompanyId = companyId?.trim() || null;
  if (!targetCompanyId) {
    const { data: firstCompany } = await supabaseAdmin
      .from("companies")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (firstCompany?.id) {
      targetCompanyId = firstCompany.id;
    } else {
      const { data: createdComp, error: compErr } = await supabaseAdmin
        .from("companies")
        .insert({ name: "Empresa Principal" })
        .select("id")
        .single();
      if (compErr || !createdComp) throw new Error("Nenhuma empresa cadastrada no sistema.");
      targetCompanyId = createdComp.id;
    }
  }

  if (!targetCompanyId) {
    throw new Error("Nenhuma empresa cadastrada no sistema.");
  }

  const randomHash = Math.random().toString(36).substring(2, 8);
  const instanceName = `warmer-${targetCompanyId.slice(0, 8)}-${randomHash}`;
  const instanceToken = crypto.randomUUID().replace(/-/g, "");

  // 1. Cria a instância no EvoGo
  const created = await evogoRequest("/instance/create", {
    method: "POST",
    body: { name: instanceName, token: instanceToken },
  });

  const evogoInstanceId = created?.data?.id || created?.id || instanceName;

  // 2. Salva no banco de dados
  const { data: row, error } = await supabaseAdmin
    .from("warmer_numbers")
    .insert({
      company_id: targetCompanyId,
      name: cleanName,
      evogo_instance_name: instanceName,
      evogo_instance_id: evogoInstanceId,
      evogo_api_key: instanceToken,
      status: "connecting",
    })
    .select("*")
    .single();

  if (error) {
    // Tenta limpar do EvoGo se falhar no banco
    await evogoRequest(`/instance/delete/${evogoInstanceId}`, { method: "DELETE" }).catch(() => {});
    throw new Error(`Falha ao salvar número: ${error.message}`);
  }

  // 3. Solicita geração de QR Code
  const qr = await getWarmerNumberQr(row.id);

  return { number: row, qrCode: qr.qrCode };
}

export async function getWarmerNumberQr(numberId: string): Promise<{
  status: WarmerStatus;
  qrCode: string | null;
  phoneNumber?: string;
  profileName?: string;
  profilePictureUrl?: string;
}> {
  const { data: num, error } = await supabaseAdmin
    .from("warmer_numbers")
    .select("*")
    .eq("id", numberId)
    .single();

  if (error || !num) throw new Error("Número de aquecimento não encontrado.");

  // Verifica status na EvoGo
  try {
    const statusRes = await evogoRequest("/instance/status", {
      method: "GET",
      apiKey: num.evogo_api_key,
    });

    const isConnected =
      statusRes?.instance?.status === "connected" ||
      statusRes?.status === "connected" ||
      statusRes?.data?.status === "connected" ||
      Boolean(
        (statusRes?.data?.Connected || statusRes?.Connected) &&
        (statusRes?.data?.LoggedIn || statusRes?.LoggedIn || statusRes?.data?.Name || statusRes?.Name)
      );

    if (isConnected) {
      const target = num.evogo_instance_id || num.evogo_instance_name;
      const statusName = statusRes?.data?.Name || statusRes?.Name || null;
      const profile = await fetchChipProfile(target, num.evogo_api_key, statusName);

      const phone = profile.phone || num.phone_number;
      const profileName =
        profile.profileName ||
        (statusName && !statusName.startsWith("warmer-") ? statusName : null) ||
        (num.profile_name && !num.profile_name.startsWith("warmer-") ? num.profile_name : null);
      const pic = profile.profilePicUrl || num.profile_picture_url;

      await supabaseAdmin
        .from("warmer_numbers")
        .update({
          status: num.status === "paused" ? "paused" : "warming",
          phone_number: phone,
          profile_name: profileName,
          profile_picture_url: pic,
          updated_at: new Date().toISOString(),
        })
        .eq("id", numberId);

      return {
        status: num.status === "paused" ? "paused" : "warming",
        qrCode: null,
        phoneNumber: phone || undefined,
        profileName: profileName || undefined,
        profilePictureUrl: pic || undefined,
      };
    }
  } catch (err) {
    console.warn(`[warmer] Erro ao checar status do chip ${num.name}:`, err);
  }

  // Se não estiver conectado, obtém o QR Code
  try {
    const qrRes = await evogoRequest("/instance/qr", {
      method: "GET",
      apiKey: num.evogo_api_key,
    });

    const rawQr = qrRes?.qrcode || qrRes?.data?.qrcode || qrRes?.base64;
    const qrCode = rawQr ? (rawQr.startsWith("data:") ? rawQr : `data:image/png;base64,${rawQr}`) : null;

    return { status: "connecting", qrCode, phoneNumber: num.phone_number };
  } catch (err) {
    // Tenta conectar a instância para forçar novo QR Code
    await evogoRequest("/instance/connect", {
      method: "POST",
      apiKey: num.evogo_api_key,
    }).catch(() => {});

    return { status: "connecting", qrCode: null, phoneNumber: num.phone_number };
  }
}

export async function toggleWarmerNumber(numberId: string, pause: boolean) {
  const newStatus: WarmerStatus = pause ? "paused" : "warming";
  const { error } = await supabaseAdmin
    .from("warmer_numbers")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", numberId);

  if (error) throw error;
}

export async function refreshChipProfile(numberId: string) {
  const { data: num, error } = await supabaseAdmin
    .from("warmer_numbers")
    .select("*")
    .eq("id", numberId)
    .single();

  if (error || !num) throw new Error("Número de aquecimento não encontrado.");

  let statusName: string | null = null;
  try {
    const sRes = await evogoRequest("/instance/status", {
      method: "GET",
      apiKey: num.evogo_api_key,
      timeoutMs: 4000,
    });
    statusName = sRes?.data?.Name || sRes?.Name || null;
  } catch {}

  const target = num.evogo_instance_id || num.evogo_instance_name;
  const profile = await fetchChipProfile(target, num.evogo_api_key, statusName);

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (profile.phone) updates.phone_number = profile.phone;
  if (profile.profileName) updates.profile_name = profile.profileName;
  if (profile.profilePicUrl) updates.profile_picture_url = profile.profilePicUrl;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("warmer_numbers")
    .update(updates)
    .eq("id", numberId)
    .select("*")
    .single();

  if (updateErr) throw updateErr;
  return updated;
}

export async function graduateWarmerNumber(numberId: string) {
  const { data: num, error } = await supabaseAdmin
    .from("warmer_numbers")
    .select("evogo_instance_id, evogo_instance_name, evogo_api_key")
    .eq("id", numberId)
    .single();

  if (error || !num) throw new Error("Chip de aquecimento não encontrado.");

  // 1. Desconecta a sessão do WhatsApp no EvoGo para liberar o uso no outro celular
  try {
    await evogoRequest(`/instance/logout`, {
      method: "DELETE",
      apiKey: num.evogo_api_key,
    }).catch(async () => {
      await evogoRequest(`/instance/logout`, {
        method: "POST",
        apiKey: num.evogo_api_key,
      });
    });
  } catch (e) {
    // Continua mesmo se já desconectado
  }

  // 2. Encerra diálogos ativos que envolviam este chip
  await supabaseAdmin
    .from("warmer_dialogs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("status", "active")
    .or(`initiator_number_id.eq.${numberId},responder_number_id.eq.${numberId}`);

  // 3. Marca o chip como graduado no histórico
  const { error: updateErr } = await supabaseAdmin
    .from("warmer_numbers")
    .update({
      status: "graduated",
      health_score: 100,
      graduated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", numberId);

  if (updateErr) throw updateErr;
}

export async function deleteWarmerNumber(numberId: string) {
  const { data: num } = await supabaseAdmin
    .from("warmer_numbers")
    .select("evogo_instance_id, evogo_instance_name, evogo_api_key")
    .eq("id", numberId)
    .single();

  if (num) {
    const target = num.evogo_instance_id || num.evogo_instance_name;
    await evogoRequest(`/instance/delete/${target}`, { method: "DELETE" }).catch(() => {});
  }

  const { error } = await supabaseAdmin.from("warmer_numbers").delete().eq("id", numberId);
  if (error) throw error;
}

// =====================================================================
// 3. IA & Contingência de Diálogos Naturais Brasileiros
// =====================================================================

const TOPICS = [
  "futebol e jogos da rodada",
  "trânsito e chuva na cidade",
  "dicas de comida e almoço",
  "filmes e séries do momento",
  "trabalho e correria da semana",
  "planos para o final de semana",
  "café e pausa na rotina",
  "compras e promoções",
];

const CONTINGENCY_DIALOGS: Record<
  string,
  { t1: string; t2: string; t3: string; t4: string }[]
> = {
  futebol: [
    {
      t1: "Fala meu bom! Conseguiu ver o jogo ontem?",
      t2: "Fala parceiro! Vi sim, que segundo tempo doido né kkk",
      t3: "Demais, achei que ia dar empate no final! Semana que vem tem clássico de novo.",
      t4: "Nem me fala, vai ser jogão! Bom dia aí mano, abraço!",
    },
    {
      t1: "E aí mano, tudo certo? Vai jogar bola esse final de semana?",
      t2: "Tranquilo por aqui! Rapaz, tô quebrado do trampo mas acho que domingo dá pra ir sim.",
      t3: "Bora sim, vou confirmar com o pessoal a quadra.",
      t4: "Fechou então! Qualquer coisa me dá um alô por aqui. Valeu!",
    },
  ],
  trabalho: [
    {
      t1: "Opa, bom dia! Como tá a correria por aí hoje?",
      t2: "Bom dia! Eita, aqui tá uma loucura de trampo kkk e por aí?",
      t3: "Mesma coisa mano, fechando uns relatórios aqui que não acabam mais.",
      t4: "Sei bem como é kkk força aí mano, bom trabalho pra nós!",
    },
    {
      t1: "Fala amigo, tudo certinho? Tirou um café já?",
      t2: "Fala! Já tomei duas xícaras pra conseguir acordar hoje haha",
      t3: "Boa kkk café salva vidas nessa rotina.",
      t4: "Com certeza! Bora que o dia é longo. Qualquer coisa nos falamos!",
    },
  ],
  geral: [
    {
      t1: "Fala mano, beleza? Tudo joia por aí?",
      t2: "Opa! Tudo em paz e com você? Tudo tranquilo?",
      t3: "Tudo nos conformes por aqui, só passando pra dar um salve mesmo.",
      t4: "Show de bola! Valeu pela lembrança, bom resto de semana pra você aí!",
    },
    {
      t1: "E aí, como foram as coisas no fim de semana?",
      t2: "Fala! Deu pra descansar um pouco com a família, e por aí?",
      t3: "Bom demais! Por aqui foi correria mas tudo em ordem.",
      t4: "Massa demais meu caro! Te cuida aí, até mais!",
    },
  ],
};

async function generateAIResponse(params: {
  apiKey?: string | null;
  customPrompt?: string | null;
  topic: string;
  history: { role: "user" | "assistant"; content: string }[];
  turnIndex: number;
  maxTurns: number;
}): Promise<string> {
  const { apiKey, customPrompt, topic, history, turnIndex, maxTurns } = params;
  const isClosing = turnIndex >= maxTurns - 1;

  if (apiKey && apiKey.trim().startsWith("sk-")) {
    try {
      const baseSystemPrompt =
        customPrompt?.trim() ||
        `Você é uma pessoa comum brasileira conversando no WhatsApp com um amigo ou conhecido de trabalho.
REGRAS OBRIGATÓRIAS:
- Responda em português brasileiro coloquial, com gírias leves (ex: "mano", "beleza", "tranquilo", "show", "kkk"), estilo mensagem de WhatsApp real.
- Seja SUPER BREVE: no máximo 1 ou 2 frases curtas. Não escreva textos longos nem parágrafos explicativos.
- Nunca se identifique como inteligência artificial, robô ou assistente.`;

      const turnInstruction = isClosing
        ? `\nATENÇÃO: Este é o ÚLTIMO turno da conversa. Encerre educadamente com uma despedida curta e amigável (ex: "Fechou, bom trampo aí!", "Tranquilo mano, abraço!", "Valeu, até mais!"). NÃO faça novas perguntas.`
        : `\nInstrução: Responda de forma natural sobre o tema "${topic}" e faça um comentário ou pergunta leve para continuar a conversa.`;

      const messages: any[] = [
        { role: "system", content: `${baseSystemPrompt}${turnInstruction}` },
        ...history.slice(-4), // Pega no máximo os últimos 4 turnos
      ];

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 80,
          temperature: 0.85,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          let cleaned = text.replace(/^["']|["']$/g, "").trim();
          // Trava Anti-Looping: o último turno nunca pode ter interrogações
          if (isClosing && cleaned.includes("?")) {
            cleaned = cleaned.split("?")[0].replace(/[.,;!]+$/, "") + ". Fechou mano, bom trabalho aí, abraço!";
          }
          return cleaned;
        }
      }
    } catch (err) {
      console.warn("[warmer] Falha na chamada da OpenAI, usando contingência nativa:", err);
    }
  }

  // Contingência nativa de diálogos
  const category = topic.includes("futebol") ? "futebol" : topic.includes("trabalho") ? "trabalho" : "geral";
  const list = CONTINGENCY_DIALOGS[category] || CONTINGENCY_DIALOGS.geral;
  const pick = list[Math.floor(Math.random() * list.length)];

  if (turnIndex === 0) return pick.t1;
  if (turnIndex === 1) return pick.t2;
  if (turnIndex === 2) return pick.t3;
  let finalTurn = pick.t4;
  if (isClosing && finalTurn.includes("?")) {
    finalTurn = finalTurn.split("?")[0].replace(/[.,;!]+$/, "") + ". Fechou mano, até mais!";
  }
  return finalTurn;
}

// =====================================================================
// 4. Simulação de Presença Humana e Envio de Mensagem
// =====================================================================

async function sendHumanizedMessage(params: {
  fromApiKey: string;
  toPhone: string;
  content: string;
  messageType?: "text" | "sticker" | "poll";
}) {
  const { fromApiKey, toPhone, content } = params;

  let formattedNumber = toPhone;
  if (!formattedNumber.includes("@g.us")) {
    let digits = toPhone.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
    formattedNumber = digits;
  }

  // 1. Marca presença "digitando..." (composing)
  try {
    const presenceTarget = formattedNumber.includes("@")
      ? formattedNumber
      : `${formattedNumber}@s.whatsapp.net`;
    await evogoRequest("/message/presence", {
      method: "POST",
      apiKey: fromApiKey,
      body: { number: presenceTarget, state: "composing", presence: "composing" },
    });
  } catch (e) {
    // Presença é opcional, não bloqueia o envio
  }

  // 2. Pequeno delay de digitação humano (2 a 4 segundos)
  await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2000));

  // 3. Dispara o texto
  const sent = await evogoRequest("/send/text", {
    method: "POST",
    apiKey: fromApiKey,
    body: {
      number: formattedNumber,
      text: content,
      delay: 1000,
    },
  });

  return sent;
}

// =====================================================================
// 5. Motor de Grupos de Aquecimento Coletivo
// =====================================================================

export async function syncWarmerGroups(companyId: string, isForce: boolean = false) {
  // Busca todos os números conectados da empresa
  const { data: numbers } = await supabaseAdmin
    .from("warmer_numbers")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["warming", "idle"]);

  if (!numbers || numbers.length === 0) return;

  // Apenas chips com módulo de grupos ativado (Liga/Desliga individual)
  const eligibleGroupNumbers = numbers.filter((n: any) => n.enable_groups !== false);
  if (eligibleGroupNumbers.length < 2) return;

  // Busca se já existe um grupo ativo
  const { data: existingGroup } = await supabaseAdmin
    .from("warmer_groups")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existingGroup) {
    // Cria um novo grupo usando o primeiro número conectado
    const creator = eligibleGroupNumbers[0];
    const groupName = `Resenha & Dicas ${Math.floor(Math.random() * 100)}`;
    const otherPhones = eligibleGroupNumbers
      .slice(1)
      .map((n: any) => `${(n.phone_number || "").replace(/\D/g, "")}@s.whatsapp.net`)
      .filter((p: string) => !p.startsWith("@"));

    if (otherPhones.length === 0) return;

    try {
      const created = await evogoRequest("/group/create", {
        method: "POST",
        apiKey: creator.evogo_api_key,
        body: {
          groupName,
          name: groupName,
          participants: otherPhones,
        },
      });

      const groupJid = created?.group?.jid || created?.jid || created?.id;
      if (!groupJid) return;

      // Obtém o link de convite do grupo
      let inviteLink = null;
      try {
        const linkRes = await evogoRequest("/group/invitelink", {
          method: "POST",
          apiKey: creator.evogo_api_key,
          body: { groupJid },
        });
        inviteLink = linkRes?.link || linkRes?.inviteLink || null;
      } catch (e) {
        console.warn("[warmer] Não foi possível gerar link de convite para o grupo:", e);
      }

      await supabaseAdmin.from("warmer_groups").insert({
        company_id: companyId,
        group_jid: groupJid,
        group_name: groupName,
        invite_link: inviteLink,
        creator_number_id: creator.id,
        members_count: eligibleGroupNumbers.length,
      });

      console.log(`[warmer] Grupo de aquecimento criado: ${groupName} (${groupJid})`);
    } catch (err: any) {
      console.error("[warmer] Erro ao criar grupo de aquecimento:", err.message);
    }
  } else {
    // Grupo existente: envia interação coletiva se o horário estiver vencido ou se for tick forçado
    const now = new Date();
    const isDue = isForce || !existingGroup.next_interaction_at || new Date(existingGroup.next_interaction_at) <= now;
    if (isDue) {
      const sender = eligibleGroupNumbers[Math.floor(Math.random() * eligibleGroupNumbers.length)];
      if (sender?.evogo_api_key) {
        const GROUP_PHRASES = [
          "Fala pessoal, tudo bom por aí?",
          "Bom dia a todos!",
          "Boa tarde turma, como estão as coisas?",
          "Passando pra desejar um excelente dia pra todo mundo!",
          "E aí galera, tudo certo?",
          "Top demais! Bom descanso mais tarde.",
          "Valeu pessoal, tamo junto!",
        ];
        const content = GROUP_PHRASES[Math.floor(Math.random() * GROUP_PHRASES.length)];

        try {
          await sendHumanizedMessage({
            fromApiKey: sender.evogo_api_key,
            toPhone: existingGroup.group_jid,
            content,
          });

          await supabaseAdmin.from("warmer_messages").insert({
            company_id: companyId,
            group_id: existingGroup.id,
            from_number_id: sender.id,
            to_jid: existingGroup.group_jid,
            from_phone: sender.phone_number,
            content,
            message_type: "text",
          });

          const nextDelayMinutes = 60 + Math.floor(Math.random() * 120); // 1 a 3 horas
          const nextInteraction = new Date(Date.now() + nextDelayMinutes * 60 * 1000).toISOString();

          await supabaseAdmin
            .from("warmer_groups")
            .update({
              last_interaction_at: now.toISOString(),
              next_interaction_at: nextInteraction,
              members_count: eligibleGroupNumbers.length,
            })
            .eq("id", existingGroup.id);
        } catch (e: any) {
          console.warn("[warmer] Falha na interação de grupo:", e.message);
        }
      }
    }
  }
}

// =====================================================================
// 5.1 Motor de Publicação de Status (Stories do WhatsApp)
// =====================================================================

export async function syncWarmerStatus(companyId: string, isForce: boolean = false): Promise<number> {
  const { data: numbers } = await supabaseAdmin
    .from("warmer_numbers")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["warming", "idle"]);

  if (!numbers || numbers.length === 0) return 0;

  const eligibleStatusNumbers = numbers.filter((n: any) => n.enable_status !== false && n.evogo_api_key);
  if (eligibleStatusNumbers.length === 0) return 0;

  const STATUS_MESSAGES = [
    "Bom dia! Que a semana seja abençoada e produtiva para todos nós. 🙏☕",
    "Café na mão e foco no objetivo! Bom dia turma. 🚀",
    "Foco, força e fé! Excelente dia a todos. ✨",
    "Pausa para o almoço merecido. 🍽️",
    "Mais um dia de trabalho vencido, gratidão! 🙌",
    "Bora que o ano já começou com tudo! 💼",
    "Desejo uma ótima tarde a todos os amigos e clientes!",
  ];

  let statusPosts = 0;

  for (const chip of eligibleStatusNumbers) {
    // Posta com 25% de chance a cada tick ou se for forçado
    if (isForce || Math.random() < 0.25) {
      const text = STATUS_MESSAGES[Math.floor(Math.random() * STATUS_MESSAGES.length)];
      try {
        await evogoRequest("/send/text", {
          method: "POST",
          apiKey: chip.evogo_api_key,
          body: {
            number: "status@broadcast",
            text,
            delay: 1000,
          },
        });

        // Registra o status no feed de mensagens
        await supabaseAdmin.from("warmer_messages").insert({
          company_id: companyId,
          from_number_id: chip.id,
          from_phone: chip.phone_number,
          to_jid: "status@broadcast",
          content: text,
          message_type: "status",
          direction: "outbound",
        });

        // Atualiza contadores do chip
        await supabaseAdmin
          .from("warmer_numbers")
          .update({
            messages_sent_today: (chip.messages_sent_today || 0) + 1,
            total_messages_sent: (chip.total_messages_sent || 0) + 1,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", chip.id);

        statusPosts++;
        console.log(`[warmer] Status postado pelo chip ${chip.name}: "${text}"`);
      } catch (err: any) {
        console.warn(`[warmer] Falha ao postar status para ${chip.name}:`, err.message);
      }
    }
  }

  return statusPosts;
}

// =====================================================================
// 6. Ciclo Principal do Motor (Executado via Cron Tick)
// =====================================================================

export async function processWarmerTick(options?: { force?: boolean }): Promise<{
  processedDialogs: number;
  newDialogsStarted: number;
  groupInteractions: number;
  statusPosts: number;
}> {
  const isForce = Boolean(options?.force);
  const now = new Date();
  const currentHour = now.getHours(); // Horário do servidor

  // 1. Busca todas as empresas que possuem chips cadastrados
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, warmer_settings, openai_api_key, warmer_prompt");

  if (!companies || companies.length === 0) {
    return { processedDialogs: 0, newDialogsStarted: 0, groupInteractions: 0, statusPosts: 0 };
  }

  let processedDialogs = 0;
  let newDialogsStarted = 0;
  let groupInteractions = 0;
  let statusPosts = 0;

  for (const comp of companies) {
    const settings: WarmerSettings = {
      ...DEFAULT_SETTINGS,
      ...(comp.warmer_settings || {}),
    };

    // Atualização diária: avanço da régua de maturação (Dia 1 a 14) e reset de mensagens do dia
    const { data: allActiveChips } = await supabaseAdmin
      .from("warmer_numbers")
      .select("*")
      .eq("company_id", comp.id)
      .in("status", ["warming", "idle", "paused"]);

    if (allActiveChips && allActiveChips.length > 0) {
      const todayStr = now.toISOString().slice(0, 10);
      for (const chip of allActiveChips) {
        const daysSinceCreation = Math.max(
          1,
          Math.min(
            14,
            Math.floor((now.getTime() - new Date(chip.created_at).getTime()) / (1000 * 60 * 60 * 24)) + 1
          )
        );

        const lastActivityDate = chip.last_activity_at ? chip.last_activity_at.slice(0, 10) : null;
        const needsDailyReset = lastActivityDate && lastActivityDate !== todayStr;

        const updates: any = {};
        if (chip.current_day !== daysSinceCreation) {
          updates.current_day = daysSinceCreation;
        }
        if (needsDailyReset && (chip.messages_sent_today > 0 || chip.messages_received_today > 0)) {
          updates.messages_sent_today = 0;
          updates.messages_received_today = 0;
        }

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin.from("warmer_numbers").update(updates).eq("id", chip.id);
        }
      }
    }

    // Janela de sono noturno: se estiver fora do horário (e não for disparo forçado manual), pula
    if (!isForce && (currentHour < settings.start_hour || currentHour >= settings.end_hour)) {
      continue;
    }

    // 2. Processa diálogos 1x1 ativos que estão na hora de enviar mensagem (ou todos se for disparo manual)
    let dialogQuery = supabaseAdmin
      .from("warmer_dialogs")
      .select("*, initiator:initiator_number_id(*), responder:responder_number_id(*)")
      .eq("company_id", comp.id)
      .eq("status", "active");

    if (!isForce) {
      dialogQuery = dialogQuery.lte("next_message_at", now.toISOString());
    }

    const { data: dueDialogs } = await dialogQuery.limit(3);

    if (dueDialogs && dueDialogs.length > 0) {
      for (const dialog of dueDialogs) {
        const isInitiatorTurn = dialog.next_turn_by === dialog.initiator_number_id;
        const sender = isInitiatorTurn ? dialog.initiator : dialog.responder;
        const receiver = isInitiatorTurn ? dialog.responder : dialog.initiator;

        if (!sender?.evogo_api_key || !receiver?.phone_number) {
          await supabaseAdmin
            .from("warmer_dialogs")
            .update({ status: "failed" })
            .eq("id", dialog.id);
          continue;
        }

        // Se algum dos chips estiver pausado ou com 1x1 desativado, pula este turno
        if (
          sender.status === "paused" ||
          receiver.status === "paused" ||
          sender.enable_dialogs === false ||
          receiver.enable_dialogs === false
        ) {
          continue;
        }

        // Histórico recente para dar contexto à IA
        const { data: msgHistory } = await supabaseAdmin
          .from("warmer_messages")
          .select("content, from_number_id")
          .eq("dialog_id", dialog.id)
          .order("turn_index", { ascending: true });

        const history = (msgHistory || []).map((m: any) => ({
          role: m.from_number_id === sender.id ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

        // Gera a resposta com IA ou contingência
        const responseText = await generateAIResponse({
          apiKey: comp.openai_api_key,
          customPrompt: comp.warmer_prompt,
          topic: dialog.topic || "geral",
          history,
          turnIndex: dialog.turn_count,
          maxTurns: dialog.max_turns,
        });

        // Envia mensagem simulando digitação
        try {
          await sendHumanizedMessage({
            fromApiKey: sender.evogo_api_key,
            toPhone: receiver.phone_number,
            content: responseText,
          });

          // Registra a mensagem
          await supabaseAdmin.from("warmer_messages").insert({
            company_id: comp.id,
            dialog_id: dialog.id,
            from_number_id: sender.id,
            to_number_id: receiver.id,
            from_phone: sender.phone_number,
            to_phone: receiver.phone_number,
            content: responseText,
            turn_index: dialog.turn_count,
          });

          // Atualiza contadores dos chips
          await supabaseAdmin
            .from("warmer_numbers")
            .update({
              messages_sent_today: (sender.messages_sent_today || 0) + 1,
              total_messages_sent: (sender.total_messages_sent || 0) + 1,
              last_activity_at: now.toISOString(),
            })
            .eq("id", sender.id);

          await supabaseAdmin
            .from("warmer_numbers")
            .update({
              messages_received_today: (receiver.messages_received_today || 0) + 1,
              total_messages_received: (receiver.total_messages_received || 0) + 1,
              last_activity_at: now.toISOString(),
            })
            .eq("id", receiver.id);

          const newTurnCount = dialog.turn_count + 1;

          // Se atingiu o limite de turnos, ENCERRA A CONVERSA (Prevenção Anti-Looping estrita)
          if (newTurnCount >= dialog.max_turns) {
            const cooldownMinutes = 20 + Math.floor(Math.random() * 25); // 20 a 45 min
            const cooldownDate = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();

            await supabaseAdmin
              .from("warmer_dialogs")
              .update({
                status: "completed",
                turn_count: newTurnCount,
                completed_at: now.toISOString(),
                last_message_content: responseText,
              })
              .eq("id", dialog.id);

            // Coloca ambos os chips em cooldown
            await supabaseAdmin
              .from("warmer_numbers")
              .update({ cooldown_until: cooldownDate })
              .in("id", [sender.id, receiver.id]);

            console.log(`[warmer] Diálogo ${dialog.id} finalizado com sucesso (${newTurnCount} turnos). Chips em descanso até ${cooldownDate}`);
          } else {
            // Próximo turno: delay humanizado entre 60s e 180s
            const delaySecs =
              settings.min_delay_seconds +
              Math.floor(Math.random() * (settings.max_delay_seconds - settings.min_delay_seconds));
            const nextTime = new Date(Date.now() + delaySecs * 1000).toISOString();

            await supabaseAdmin
              .from("warmer_dialogs")
              .update({
                turn_count: newTurnCount,
                next_turn_by: receiver.id,
                next_message_at: nextTime,
                last_message_content: responseText,
              })
              .eq("id", dialog.id);
          }

          processedDialogs++;
        } catch (err: any) {
          console.error(`[warmer] Falha no envio do diálogo ${dialog.id}:`, err.message);
        }
      }
    }

    // 3. Sorteia e inicia novos diálogos se houver chips livres fora de cooldown
    const { data: freeNumbers } = await supabaseAdmin
      .from("warmer_numbers")
      .select("*")
      .eq("company_id", comp.id)
      .in("status", ["warming", "idle"])
      .or(`cooldown_until.is.null,cooldown_until.lte.${now.toISOString()}`);

    // Busca quais números já estão engajados em diálogos ativos agora (anti-colisão)
    const { data: activeDialogs } = await supabaseAdmin
      .from("warmer_dialogs")
      .select("initiator_number_id, responder_number_id")
      .eq("company_id", comp.id)
      .eq("status", "active");

    const busyIds = new Set(
      (activeDialogs || []).flatMap((d: any) => [d.initiator_number_id, d.responder_number_id])
    );
    // Filtra chips que não estão ocupados e que têm enable_dialogs ativado
    const trulyFreeNumbers = (freeNumbers || []).filter(
      (n: any) => !busyIds.has(n.id) && n.enable_dialogs !== false
    );

    if (trulyFreeNumbers.length >= 2) {
      // Permite até 2 diálogos simultâneos por empresa para não sobrecarregar
      if ((activeDialogs?.length || 0) < 2) {
        // Embaralha e escolhe 2 números distintos que não estejam já em diálogo ativo
        const shuffled = trulyFreeNumbers.sort(() => 0.5 - Math.random());
        const n1 = shuffled[0];
        const n2 = shuffled[1];

        if (n1.id !== n2.id && n1.phone_number && n2.phone_number) {
          const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];

          // 1. Gera a mensagem de abertura do diálogo (Turno 0)
          const openingText = await generateAIResponse({
            apiKey: comp.openai_api_key,
            customPrompt: comp.warmer_prompt,
            topic,
            history: [],
            turnIndex: 0,
            maxTurns: settings.max_turns_per_dialog,
          });

          // Delay humanizado para a resposta do segundo chip
          const delaySecs =
            settings.min_delay_seconds +
            Math.floor(Math.random() * (settings.max_delay_seconds - settings.min_delay_seconds));
          const nextTime = new Date(Date.now() + delaySecs * 1000).toISOString();

          // 2. Cria o diálogo já com o turno 1 aguardando a resposta de n2
          const { data: createdDialog } = await supabaseAdmin
            .from("warmer_dialogs")
            .insert({
              company_id: comp.id,
              initiator_number_id: n1.id,
              responder_number_id: n2.id,
              topic,
              turn_count: 1,
              max_turns: settings.max_turns_per_dialog,
              next_turn_by: n2.id,
              next_message_at: nextTime,
              last_message_content: openingText,
            })
            .select()
            .single();

          if (createdDialog) {
            newDialogsStarted++;
            console.log(`[warmer] Nova conversa iniciada entre ${n1.name} e ${n2.name} sobre "${topic}"`);

            // 3. Dispara a mensagem de abertura imediatamente!
            try {
              await sendHumanizedMessage({
                fromApiKey: n1.evogo_api_key,
                toPhone: n2.phone_number,
                content: openingText,
              });

              // Registra a mensagem no histórico
              await supabaseAdmin.from("warmer_messages").insert({
                company_id: comp.id,
                dialog_id: createdDialog.id,
                from_number_id: n1.id,
                to_number_id: n2.id,
                from_phone: n1.phone_number,
                to_phone: n2.phone_number,
                content: openingText,
                turn_index: 0,
              });

              // Atualiza contadores dos chips
              await supabaseAdmin
                .from("warmer_numbers")
                .update({
                  messages_sent_today: (n1.messages_sent_today || 0) + 1,
                  total_messages_sent: (n1.total_messages_sent || 0) + 1,
                  last_activity_at: now.toISOString(),
                })
                .eq("id", n1.id);

              await supabaseAdmin
                .from("warmer_numbers")
                .update({
                  messages_received_today: (n2.messages_received_today || 0) + 1,
                  total_messages_received: (n2.total_messages_received || 0) + 1,
                  last_activity_at: now.toISOString(),
                })
                .eq("id", n2.id);

              processedDialogs++;
            } catch (err: any) {
              console.error(`[warmer] Falha no disparo inicial do diálogo ${createdDialog.id}:`, err.message);
            }
          }
        }
      }
    }

    // 4. Sincroniza e movimenta grupos de aquecimento
    if (settings.enable_groups) {
      await syncWarmerGroups(comp.id, isForce);
    }

    // 5. Publicação de Status nos Stories do WhatsApp
    if (settings.enable_status) {
      statusPosts += await syncWarmerStatus(comp.id, isForce);
    }
  }

  return { processedDialogs, newDialogsStarted, groupInteractions, statusPosts };
}
