
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testQr() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) {
    console.error("Settings not found");
    return;
  }

  const { data: inst } = await supabaseAdmin
    .from("instances")
    .select("evogo_api_key, instance_name")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!inst) {
    console.error("Instance not found");
    return;
  }

  console.log(`Testing QR for instance: ${inst.instance_name}`);
  console.log(`URL: ${settings.evogo_url}/instance/qr`);
  console.log(`ApiKey: ${inst.evogo_api_key}`);

  const res = await fetch(`${settings.evogo_url}/instance/qr`, {
    headers: {
      "apikey": inst.evogo_api_key
    }
  });

  console.log(`Status: ${res.status}`);
  const body = await res.json();
  console.log(`Body:`, JSON.stringify(body, null, 2));
}

testQr().catch(console.error);
