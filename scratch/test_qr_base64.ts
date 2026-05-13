
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testQrBase64() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const { data: inst } = await supabaseAdmin
    .from("instances")
    .select("evogo_api_key")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!inst) return;

  console.log(`Testing QR with ?base64=true`);
  const res = await fetch(`${settings.evogo_url}/instance/qr?base64=true`, {
    headers: { "apikey": inst.evogo_api_key }
  });

  const body = await res.json();
  console.log(`Body:`, JSON.stringify(body, null, 2));
}

testQrBase64().catch(console.error);
