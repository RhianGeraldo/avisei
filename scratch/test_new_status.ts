
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testNewStatus() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceName = "test-status-" + Date.now();
  const instanceToken = "test-token-" + Date.now();

  console.log(`Creating test instance...`);
  const createRes = await fetch(`${settings.evogo_url}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": settings.evogo_admin_token },
    body: JSON.stringify({ name: instanceName, token: instanceToken })
  });
  
  // Wait a bit for initialization
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Checking status...`);
  const stRes = await fetch(`${settings.evogo_url}/instance/status`, {
    headers: { "apikey": instanceToken }
  });
  const stBody = await stRes.json();
  console.log(JSON.stringify(stBody, null, 2));
}

testNewStatus().catch(console.error);
