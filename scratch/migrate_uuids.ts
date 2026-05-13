
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function migrateUuids() {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("evogo_url, evogo_admin_token")
    .eq("id", true)
    .maybeSingle();

  if (!settings) {
    console.error("Settings not found");
    return;
  }

  console.log("Fetching all instances from EvoGo...");
  const res = await fetch(`${settings.evogo_url}/instance/all`, {
    headers: { "apikey": settings.evogo_admin_token }
  });
  const body = await res.json();
  const apiInstances = body.data || body;

  console.log(`Found ${apiInstances.length} instances in API.`);

  const { data: dbInstances } = await supabaseAdmin
    .from("instances")
    .select("id, instance_name, evogo_instance_id");

  for (const dbInst of (dbInstances || [])) {
    if (dbInst.evogo_instance_id) continue;

    const match = apiInstances.find((ai: any) => ai.name === dbInst.instance_name);
    if (match) {
      console.log(`Updating ${dbInst.instance_name} with UUID ${match.id}...`);
      await supabaseAdmin
        .from("instances")
        .update({ evogo_instance_id: match.id })
        .eq("id", dbInst.id);
    } else {
      console.warn(`No match found for ${dbInst.instance_name}`);
    }
  }
  console.log("Migration complete.");
}

migrateUuids().catch(console.error);
