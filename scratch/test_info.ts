
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testInfo() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceId = "53ca07e0-e56d-4314-a9f0-a4be833e8ea4";

  console.log(`--- INFO for ${instanceId} ---`);
  const infoRes = await fetch(`${settings.evogo_url}/instance/info/${instanceId}`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const infoBody = await infoRes.json();
  console.log(JSON.stringify(infoBody, null, 2));
}

testInfo().catch(console.error);
