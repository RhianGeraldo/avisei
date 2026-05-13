
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testAdvancedSettings() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const instanceId = "19e8592f-ec8c-4a78-bef2-7c865bed6f42"; // Aracruz API UUID
  const instanceToken = "4d5698d2d6a0419a9b823a040566ae0b"; // Aracruz Instance Token

  console.log(`--- Testing with ADMIN TOKEN ---`);
  const res1 = await fetch(`${settings.evogo_url}/instance/${instanceId}/advanced-settings`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  console.log(`Admin Token Status: ${res1.status}`);
  console.log(await res1.text());

  console.log(`\n--- Testing with INSTANCE TOKEN ---`);
  const res2 = await fetch(`${settings.evogo_url}/instance/${instanceId}/advanced-settings`, {
    headers: { "apikey": instanceToken }
  });
  console.log(`Instance Token Status: ${res2.status}`);
  console.log(await res2.text());
}

testAdvancedSettings().catch(console.error);
