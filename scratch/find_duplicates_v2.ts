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
  console.log("Analyzing message logs and campaign associations...");

  // Fetch the 15 most recent logs
  const { data: logs, error: lErr } = await supabase
    .from("message_send_logs")
    .select("*")
    .eq("number", "44991529987")
    .gte("sent_at", "2026-05-20T12:00:00Z")
    .order("sent_at", { ascending: false });

  if (lErr) {
    console.error("Error fetching logs:", lErr);
    return;
  }

  console.log(`Fetched ${logs.length} logs.`);

  // Let's query details of these logs
  const logDetails = [];
  for (const log of logs) {
    // Try to find if there is a campaign_contact associated with this message/number sent at this time
    // We can join or look for campaign contacts with sent_at close to the log's sent_at
    const time = new Date(log.sent_at);
    const timeBefore = new Date(time.getTime() - 10000).toISOString();
    const timeAfter = new Date(time.getTime() + 10000).toISOString();

    const { data: contacts } = await supabase
      .from("campaign_contacts")
      .select("id, campaign_id, campaigns(name), name, status, sent_at")
      .eq("number", log.number)
      .gte("sent_at", timeBefore)
      .lte("sent_at", timeAfter);

    logDetails.push({
      log_id: log.id,
      sent_at: log.sent_at,
      text_preview: log.text.substring(0, 35) + "...",
      contacts: contacts?.map(c => ({
        contact_id: c.id,
        campaign_name: (c.campaigns as any)?.name,
        campaign_id: c.campaign_id,
        contact_name: c.name,
        status: c.status,
        sent_at: c.sent_at
      })) || []
    });
  }

  console.log("\n--- LOGS WITH CAMPAIGN ASSOCIATION ---");
  console.dir(logDetails, { depth: null });
}

run().catch(console.error);
