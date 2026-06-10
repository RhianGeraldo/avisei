
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testGroups() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url")
    .eq("id", true)
    .single();

  if (!settings) return;

  const { data: inst } = await supabaseAdmin.from("instances").select("id, evogo_api_key, name").limit(1).single();

  if (!inst) {
    console.log("No instances found");
    return;
  }

  console.log(`--- GET /group/list for ${inst.name} ---`);
  const listRes = await fetch(`${settings.evogo_url}/group/list`, {
    headers: { "apikey": inst.evogo_api_key }
  });
  const listBody = await listRes.json();
  console.log(JSON.stringify(listBody).substring(0, 1000));
}

testGroups().catch(console.error);
