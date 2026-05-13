
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testCreate() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceName = "test-creation-" + Date.now();
  const instanceToken = "test-token-" + Date.now();

  console.log(`Creating instance: ${instanceName}`);

  const res = await fetch(`${settings.evogo_url}/instance/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": settings.evogo_admin_token
    },
    body: JSON.stringify({ name: instanceName, token: instanceToken })
  });

  console.log(`Status: ${res.status}`);
  const body = await res.json();
  console.log(`Body:`, JSON.stringify(body, null, 2));
}

testCreate().catch(console.error);
