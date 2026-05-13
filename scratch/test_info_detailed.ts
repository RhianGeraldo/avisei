
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testInfoDetailed() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceId = "19e8592f-ec8c-4a78-bef2-7c865bed6f42"; // Aracruz API UUID

  console.log(`--- INFO for ${instanceId} ---`);
  const res = await fetch(`${settings.evogo_url}/instance/info/${instanceId}`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

testInfoDetailed().catch(console.error);
