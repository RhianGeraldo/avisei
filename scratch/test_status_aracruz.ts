
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testStatusAracruz() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceApiKey = "4d5698d2d6a0419a9b823a040566ae0b"; // Aracruz API Key from DB query

  console.log(`--- STATUS for Aracruz ---`);
  const res = await fetch(`${settings.evogo_url}/instance/status`, {
    headers: { "apikey": instanceApiKey }
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

testStatusAracruz().catch(console.error);
