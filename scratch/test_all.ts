
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testAll() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const { data: inst } = await supabaseAdmin
    .from("instances")
    .select("evogo_api_key, instance_name")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!inst) return;

  console.log(`--- QR ---`);
  const qrRes = await fetch(`${settings.evogo_url}/instance/qr`, {
    headers: { "apikey": inst.evogo_api_key }
  });
  const qrBody = await qrRes.json();
  console.log(JSON.stringify(qrBody, null, 2));

  console.log(`--- STATUS ---`);
  const stRes = await fetch(`${settings.evogo_url}/instance/status`, {
    headers: { "apikey": inst.evogo_api_key }
  });
  const stBody = await stRes.json();
  console.log(JSON.stringify(stBody, null, 2));

  console.log(`--- INFO ---`);
  const infoRes = await fetch(`${settings.evogo_url}/instance/info/${inst.instance_name}`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const infoBody = await infoRes.json();
  console.log(JSON.stringify(infoBody, null, 2));
}

testAll().catch(console.error);
