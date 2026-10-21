import { NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/cron";
import { maintainCaptureSessions } from "@/lib/lead-capture.server";
import { processWarmerTick } from "@/lib/warmer.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[cron-trigger] Executando tick via API Route...");
    const result = await runCronTick({ skipShouldRun: false });

    // Captura de Leads: expira QR Codes não lidos e retoma extrações interrompidas
    let leadCapture = null;
    try {
      leadCapture = await maintainCaptureSessions();
    } catch (err: any) {
      console.error("[cron-trigger] Erro na manutenção da captura de leads:", err.message);
    }

    // Aquecedor de Números: processa turnos de diálogos, anti-loop e grupos
    let warmer = null;
    try {
      warmer = await processWarmerTick();
    } catch (err: any) {
      console.error("[cron-trigger] Erro no tick do aquecedor:", err.message);
    }

    return NextResponse.json({ success: true, ...result, leadCapture, warmer });
  } catch (error: any) {
    console.error("[cron-trigger] Erro:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
