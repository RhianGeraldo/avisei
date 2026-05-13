import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { substituirVariaveis } from "@/lib/utils";
import { sendEvogoText } from "@/lib/evogo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Validação de Autenticação (Token por Empresa)
    const authHeader = request.headers.get("Authorization");
    const providedToken = authHeader?.replace("Bearer ", "").trim();

    if (!providedToken) {
      return NextResponse.json({ error: "Unauthorized. Token não fornecido." }, { status: 401 });
    }

    // Buscar a empresa dona deste token
    const { data: companyData } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("api_token", providedToken)
      .single();

    if (!companyData) {
      return NextResponse.json({ error: "Unauthorized. Token inválido." }, { status: 401 });
    }

    // 2. Parse do Payload
    const body = await request.json();
    const { unidade, instancia, template, agendamentos } = body;

    if (!unidade || !instancia || !template || !Array.isArray(agendamentos)) {
      return NextResponse.json({ 
        error: "Payload inválido. Necessário informar unidade, instancia, template e agendamentos (array)." 
      }, { status: 400 });
    }

    if (agendamentos.length === 0) {
      return NextResponse.json({ success: true, message: "Nenhum agendamento recebido." });
    }

    // 3. Buscar IDs no banco de dados com base nos nomes passados
    // Garantir que a unidade pertence à empresa dona do token
    const { data: unitData } = await supabaseAdmin
      .from("units")
      .select("id, company_id")
      .eq("name", unidade)
      .eq("company_id", companyData.id)
      .single();

    if (!unitData) return NextResponse.json({ error: `Unidade não encontrada ou não pertence à esta credencial: ${unidade}` }, { status: 404 });

    const { data: instanceData } = await supabaseAdmin
      .from("instances")
      .select("id")
      .eq("name", instancia)
      .eq("unit_id", unitData.id)
      .single();

    if (!instanceData) return NextResponse.json({ error: `Instância não encontrada: ${instancia}` }, { status: 404 });

    const { data: templateData } = await supabaseAdmin
      .from("messages")
      .select("id, template, message_type, content_data")
      .eq("name", template)
      .eq("company_id", unitData.company_id)
      .single();

    if (!templateData) return NextResponse.json({ error: `Template não encontrado: ${template}` }, { status: 404 });

    // 4. Agrupamento de Serviços por Cliente (Telefone)
    const grupos = new Map<string, any[]>();
    for (const ag of agendamentos) {
      const telefone = ag.cliente_telefone?.replace(/\D/g, "");
      if (!telefone) continue;
      
      if (!grupos.has(telefone)) {
        grupos.set(telefone, []);
      }
      grupos.get(telefone)!.push(ag);
    }

    let enviados = 0;
    let erros = 0;

    // 5. Formatar e Disparar Mensagens Imediatamente
    for (const [telefone, ags] of grupos.entries()) {
      // Pega os dados principais do primeiro agendamento do grupo (como data, hora, nome)
      // Ordena por horário se houver a chave 'hora'
      const ordenados = [...ags].sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
      const principal = ordenados[0];

      // Junta os serviços
      const servicosUnicos = Array.from(new Set(ordenados.map(a => a.servico).filter(Boolean)))
        .map(s => `- ${s}`)
        .join("\n");

      // Monta as variáveis
      function toTitleCase(str: string): string {
        if (!str) return "";
        return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const variables = {
        cliente_nome: toTitleCase(principal.cliente_nome),
        cliente_p_nome: toTitleCase(principal.cliente_nome?.split(" ")[0]),
        data: principal.data || "",
        hora: principal.hora || "",
        profissional: principal.profissional || "",
        servicos: servicosUnicos,
        unidade: unidade
      };

      // Substitui as variáveis no template
      const textoMensagem = substituirVariaveis(templateData.template, variables);

      try {
        console.log(`[external-api] Disparando mensagem para ${telefone}...`);
        
        // Chamada imediata que já salva o histórico em message_send_logs
        await sendEvogoText({
          data: {
            instanceId: instanceData.id,
            messageId: templateData.id,
            number: telefone,
            text: textoMensagem,
            trigger_source: "api_externa",
            message_type: templateData.message_type || "text",
            content_data: templateData.content_data || {}
          }
        });

        // Opcionalmente, salvar na send_queue com status 'sent' para a tela de Queue Management
        await supabaseAdmin.from("send_queue").insert({
          unit_id: unitData.id,
          company_id: unitData.company_id,
          instance_id: instanceData.id,
          message_id: templateData.id,
          number: telefone,
          text: textoMensagem,
          status: "sent",
          trigger_source: "api_externa",
          message_type: templateData.message_type || "text",
          content_data: templateData.content_data || {}
        });

        enviados++;
      } catch (error: any) {
        console.error(`[external-api] Erro ao enviar para ${telefone}:`, error.message);
        erros++;

        // Salvar na send_queue com status 'failed' para auditoria
        await supabaseAdmin.from("send_queue").insert({
          unit_id: unitData.id,
          company_id: unitData.company_id,
          instance_id: instanceData.id,
          message_id: templateData.id,
          number: telefone,
          text: textoMensagem,
          status: "failed",
          last_error: error.message,
          trigger_source: "api_externa",
          message_type: templateData.message_type || "text",
          content_data: templateData.content_data || {}
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Processamento concluído. ${enviados} enviados, ${erros} falhas.` 
    });

  } catch (err: any) {
    console.error("[external-api] Erro não tratado:", err);
    return NextResponse.json({ error: "Erro interno no processamento", details: err.message }, { status: 500 });
  }
}
