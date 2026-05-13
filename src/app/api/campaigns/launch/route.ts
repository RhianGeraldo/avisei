import { NextRequest, NextResponse } from "next/server";
import { launchCampaign } from "@/lib/campaigns";

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    console.log(`[campaign-launch] Iniciando campanha: ${campaignId}`);
    const result = await launchCampaign(campaignId);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error(`[campaign-launch] Erro ao disparar campanha:`, error.message);
    
    // Se for um erro de "Instância desconectada", retornamos 400 em vez de 500
    const isBusinessError = error.message.includes("instância") || error.message.includes("WhatsApp");
    
    return NextResponse.json(
      { error: error.message }, 
      { status: isBusinessError ? 400 : 500 }
    );
  }
}
