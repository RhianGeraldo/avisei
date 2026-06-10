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
  console.log("Analyzing duplicate sends...");

  const { data: logs, error } = await supabase
    .from("message_send_logs")
    .select("*")
    .eq("number", "44991529987")
    .gte("sent_at", "2026-05-20T00:00:00Z")
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`\n--- ALL LOGS FOR TODAY (${logs.length} total) ---`);
  
  // Group logs that are within 5 seconds of each other
  let lastLog: any = null;
  for (const log of logs) {
    const time = new Date(log.sent_at).getTime();
    const diff = lastLog ? (time - new Date(lastLog.sent_at).getTime()) / 1000 : null;
    
    console.log({
      id: log.id,
      sent_at: log.sent_at,
      diff_from_prev_seconds: diff !== null ? `${diff}s` : "N/A",
      trigger_source: log.trigger_source,
      message_id: log.message_id,
      instance_id: log.instance_id,
      text_preview: log.text.substring(0, 30) + "..."
    });
    
    lastLog = log;
  }
}

run().catch(console.error);
