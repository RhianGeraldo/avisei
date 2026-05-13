
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testAllInstances() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const res = await fetch(`${settings.evogo_url}/instance/all`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

testAllInstances().catch(console.error);
