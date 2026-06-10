import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse .env manually
const envPath = path.resolve(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};

envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching detailed logs...");
  
  const { data: logs, error } = await supabase
    .from("message_send_logs")
    .select("*, instances(name)")
    .order("sent_at", { ascending: false })
    .limit(15);

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("\n--- DETAILED SEND LOGS ---");
  for (const log of logs) {
    console.log({
      id: log.id,
      sent_at: log.sent_at,
      number: log.number,
      instance_name: (log.instances as any)?.name,
      success: log.success,
      trigger_source: log.trigger_source,
      error: log.error,
      text: log.text.substring(0, 50) + "..."
    });
  }
}

run().catch(console.error);
