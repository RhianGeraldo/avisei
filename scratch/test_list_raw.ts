
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testListRaw() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const res = await fetch(`${settings.evogo_url}/instance/list`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const text = await res.text();
  console.log(text);
}

testListRaw().catch(console.error);
