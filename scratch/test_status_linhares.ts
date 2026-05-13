
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testStatusLinhares() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceApiKey = "40cc0aa521204bb189d1182b5fb91490"; // Linhares API Key

  console.log(`--- STATUS for Linhares ---`);
  const res = await fetch(`${settings.evogo_url}/instance/status`, {
    headers: { "apikey": instanceApiKey }
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

testStatusLinhares().catch(console.error);
