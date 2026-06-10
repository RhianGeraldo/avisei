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

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Connecting to Supabase at:", supabaseUrl);
  
  // 1. Fetch campaigns
  const { data: campaigns, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (cErr) {
    console.error("Error fetching campaigns:", cErr);
    return;
  }

  console.log("\n--- RECENT CAMPAIGNS ---");
  console.log(campaigns.map(c => ({ id: c.id, name: c.name, status: c.status, total: c.total_contacts, sent: c.sent_count, failed: c.failed_count })));

  const latestCampaign = campaigns[0];
  if (!latestCampaign) {
    console.log("No campaigns found.");
    return;
  }

  // 2. Fetch send queue for latest campaign
  const { data: queue, error: qErr } = await supabase
    .from("send_queue")
    .select("*")
    .eq("campaign_id", latestCampaign.id)
    .order("scheduled_at", { ascending: true });

  if (qErr) {
    console.error("Error fetching queue:", qErr);
    return;
  }

  console.log(`\n--- SEND QUEUE FOR LATEST CAMPAIGN (${latestCampaign.name}) ---`);
  console.log(queue.map(q => ({ id: q.id, number: q.number, status: q.status, scheduled_at: q.scheduled_at })));

  // 3. Fetch recent send logs
  const { data: logs, error: lErr } = await supabase
    .from("message_send_logs")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(20);

  if (lErr) {
    console.error("Error fetching logs:", lErr);
    return;
  }

  console.log("\n--- RECENT SEND LOGS ---");
  console.log(logs.map(l => ({ id: l.id, number: l.number, success: l.success, sent_at: l.sent_at, text: l.text.substring(0, 40) + "..." })));
}

run().catch(console.error);
