import { NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/cron";

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
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[cron-trigger] Erro:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
