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

async function fetchChipProfile(evogoInstanceId: string, evogoApiKey: string) {
  let phone: string | null = null;
  let profileName: string | null = null;
  let profilePicUrl: string | null = null;

  try {
    const infoRes = await evogoRequest(`/instance/info/${evogoInstanceId}`, {
      method: "GET",
      apiKey: evogoApiKey,
      timeoutMs: 8000,
    });
    const inst = infoRes?.instance || infoRes?.data || infoRes;
    const jid = inst?.ownerJid || inst?.owner || inst?.jid || "";
    if (jid) {
      phone = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
    }
    profileName = inst?.profileName || inst?.pushName || inst?.name || null;
    profilePicUrl = inst?.profilePicUrl || inst?.profilePictureUrl || inst?.avatar || null;
  } catch (err) {
    console.warn("[warmer] Erro ao buscar /instance/info:", err);
  }

  if (phone && !profilePicUrl) {
    try {
      const avatarRes = await evogoRequest("/user/avatar", {
        method: "POST",
        apiKey: evogoApiKey,
        body: { number: phone, preview: false },
        timeoutMs: 6000,
      });
      const url = avatarRes?.url || avatarRes?.data?.url || avatarRes?.profilePicUrl || avatarRes?.avatar;
      if (url && typeof url === "string" && url.startsWith("http")) {
        profilePicUrl = url;
      }
    } catch (e) {
      // Ignora erro de avatar
    }
  }

  if (phone && !profileName) {
    try {
      const userRes = await evogoRequest("/user/info", {
        method: "POST",
        apiKey: evogoApiKey,
        body: { number: [phone] },
        timeoutMs: 6000,
      });
      const first = Array.isArray(userRes?.data) ? userRes.data[0] : Array.isArray(userRes) ? userRes[0] : userRes;
      if (first?.name || first?.pushName || first?.notify) {
        profileName = first.name || first.pushName || first.notify;
      }
    } catch (e) {
      // Ignora erro de user/info
    }
  }

  return { phone, profileName, profilePicUrl };
}

export async function createWarmerNumber(companyId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe um nome para identificar o chip.");

  const randomHash = Math.random().toString(36).substring(2, 8);
  const instanceName = `warmer-${companyId.slice(0, 8)}-${randomHash}`;
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
      company_id: companyId,
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
      statusRes?.data?.status === "connected";

    if (isConnected) {
      const target = num.evogo_instance_id || num.evogo_instance_name;
      const profile = await fetchChipProfile(target, num.evogo_api_key);

      const phone = profile.phone || num.phone_number;
      const profileName = profile.profileName || num.profile_name;
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

  const target = num.evogo_instance_id || num.evogo_instance_name;
  const profile = await fetchChipProfile(target, num.evogo_api_key);

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
    const target = num.evogo_instance_id || num.evogo_instance_name;
    await evogoRequest(`/instance/logout`, {
      method: "POST",
      apiKey: num.evogo_api_key,
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
        if (text) return text.replace(/^["']|["']$/g, "");
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
  return pick.t4;
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
  const formattedNumber = toPhone.includes("@") ? toPhone : `${toPhone.replace(/\D/g, "")}@s.whatsapp.net`;

  // 1. Marca presença "digitando..." (composing)
  try {
    await evogoRequest("/message/presence", {
      method: "POST",
      apiKey: fromApiKey,
      body: { number: formattedNumber, presence: "composing" },
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

export async function syncWarmerGroups(companyId: string) {
  // Busca todos os números conectados da empresa
  const { data: numbers } = await supabaseAdmin
    .from("warmer_numbers")
    .select("*")
    .eq("company_id", companyId)
    .in("status", ["warming", "idle"]);

  if (!numbers || numbers.length < 2) return;

  // Busca se já existe um grupo ativo
  const { data: existingGroup } = await supabaseAdmin
    .from("warmer_groups")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existingGroup) {
    // Cria um novo grupo usando o primeiro número conectado
    const creator = numbers[0];
    const groupName = `Resenha & Dicas ${Math.floor(Math.random() * 100)}`;
    const otherPhones = numbers
      .slice(1)
      .map((n: any) => `${(n.phone_number || "").replace(/\D/g, "")}@s.whatsapp.net`)
      .filter((p: string) => !p.startsWith("@"));

    try {
      const created = await evogoRequest("/group/create", {
        method: "POST",
        apiKey: creator.evogo_api_key,
        body: {
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
        members_count: numbers.length,
      });

      console.log(`[warmer] Grupo de aquecimento criado: ${groupName} (${groupJid})`);
    } catch (err: any) {
      console.error("[warmer] Erro ao criar grupo de aquecimento:", err.message);
    }
  }
}

// =====================================================================
// 6. Ciclo Principal do Motor (Executado via Cron Tick)
// =====================================================================

export async function processWarmerTick(): Promise<{
  processedDialogs: number;
  newDialogsStarted: number;
  groupInteractions: number;
}> {
  const now = new Date();
  const currentHour = now.getHours(); // Horário do servidor

  // 1. Busca todas as empresas que possuem chips cadastrados
  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id, warmer_settings, openai_api_key, warmer_prompt");

  if (!companies || companies.length === 0) {
    return { processedDialogs: 0, newDialogsStarted: 0, groupInteractions: 0 };
  }

  let processedDialogs = 0;
  let newDialogsStarted = 0;
  let groupInteractions = 0;

  for (const comp of companies) {
    const settings: WarmerSettings = {
      ...DEFAULT_SETTINGS,
      ...(comp.warmer_settings || {}),
    };

    // Janela de sono noturno: se estiver fora do horário, pula
    if (currentHour < settings.start_hour || currentHour >= settings.end_hour) {
      continue;
    }

    // 2. Processa diálogos 1x1 ativos que estão na hora de enviar mensagem
    const { data: dueDialogs } = await supabaseAdmin
      .from("warmer_dialogs")
      .select("*, initiator:initiator_number_id(*), responder:responder_number_id(*)")
      .eq("company_id", comp.id)
      .eq("status", "active")
      .lte("next_message_at", now.toISOString())
      .limit(3);

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

    if (freeNumbers && freeNumbers.length >= 2) {
      // Verifica quantos diálogos já estão ativos nessa empresa
      const { count: activeCount } = await supabaseAdmin
        .from("warmer_dialogs")
        .select("id", { count: "exact", head: true })
        .eq("company_id", comp.id)
        .eq("status", "active");

      // Permite até 2 diálogos simultâneos por empresa para não sobrecarregar
      if ((activeCount || 0) < 2) {
        // Embaralha e escolhe 2 números distintos que não estejam já em diálogo ativo
        const shuffled = freeNumbers.sort(() => 0.5 - Math.random());
        const n1 = shuffled[0];
        const n2 = shuffled[1];

        if (n1.id !== n2.id && n1.phone_number && n2.phone_number) {
          const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
          const initialDelaySecs = 15 + Math.floor(Math.random() * 30);

          await supabaseAdmin.from("warmer_dialogs").insert({
            company_id: comp.id,
            initiator_number_id: n1.id,
            responder_number_id: n2.id,
            topic,
            turn_count: 0,
            max_turns: settings.max_turns_per_dialog,
            next_turn_by: n1.id,
            next_message_at: new Date(Date.now() + initialDelaySecs * 1000).toISOString(),
          });

          newDialogsStarted++;
          console.log(`[warmer] Nova conversa iniciada entre ${n1.name} e ${n2.name} sobre "${topic}"`);
        }
      }
    }

    // 4. Sincroniza e movimenta grupos de aquecimento
    if (settings.enable_groups) {
      await syncWarmerGroups(comp.id);
    }
  }

  return { processedDialogs, newDialogsStarted, groupInteractions };
}
