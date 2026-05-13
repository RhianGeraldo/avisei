
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function testFetchParsed() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .single();

  if (!settings) return;

  const res = await fetch(`${settings.evogo_url}/instance/fetch`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const text = await res.text();
  console.log(`Raw text:`, text);
  
  try {
    const json = JSON.parse(text);
    console.log(`Single JSON:`, json);
  } catch (e) {
    console.log(`Failed single JSON, trying multiple...`);
    // Split by }{ and fix it
    const parts = text.split(/(?<=})\s*(?={)/);
    parts.forEach((p, i) => {
      try {
        console.log(`Part ${i}:`, JSON.parse(p));
      } catch (e2) {
        console.log(`Part ${i} failed to parse:`, p);
      }
    });
  }
}

testFetchParsed().catch(console.error);
