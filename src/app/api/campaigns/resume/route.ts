import { NextRequest, NextResponse } from "next/server";
import { resumeCampaign } from "@/lib/campaigns";

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = await request.json();
    if (!campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });

    await resumeCampaign(campaignId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
