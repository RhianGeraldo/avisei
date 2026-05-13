
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testInfoName() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceName = "estetica-e-laser-aracruz-agendamento";

  console.log(`--- INFO for ${instanceName} ---`);
  const infoRes = await fetch(`${settings.evogo_url}/instance/info/${instanceName}`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const infoBody = await infoRes.json();
  console.log(JSON.stringify(infoBody, null, 2));
}

testInfoName().catch(console.error);
