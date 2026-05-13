
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testSettingsName() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceName = "estetica-e-laser-aracruz-agendamento";
  const instanceToken = "4d5698d2d6a0419a9b823a040566ae0b";

  console.log(`--- Testing NAME with INSTANCE TOKEN ---`);
  const res = await fetch(`${settings.evogo_url}/instance/${instanceName}/advanced-settings`, {
    headers: { "apikey": instanceToken }
  });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}

testSettingsName().catch(console.error);
