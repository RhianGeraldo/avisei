import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function GET() {
  try {
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("evogo_url")
      .eq("id", true)
      .single();

    if (!settings) return NextResponse.json({ error: "No settings" });

    const { data: inst } = await supabaseAdmin.from("instances").select("id, evogo_api_key, name").eq("status", "connected").limit(1).single();

    if (!inst) {
      return NextResponse.json({ error: "No connected instances found" });
    }

    const listRes = await fetch(`${settings.evogo_url}/group/list`, {
      headers: { "apikey": inst.evogo_api_key }
    });
    const listBody = await listRes.json();
    
    return NextResponse.json({ 
      instanceName: inst.name,
      structure: Array.isArray(listBody) ? listBody.slice(0, 2) : listBody
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
