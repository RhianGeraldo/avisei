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
  console.log("Analyzing send_queue duplicates...");

  // Fetch ALL rows currently in send_queue
  const { data: queue, error } = await supabase
    .from("send_queue")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Total queue rows currently in DB: ${queue.length}`);
  
  // Find duplicate scheduled_at times
  const counts: Record<string, number> = {};
  for (const item of queue) {
    const time = item.scheduled_at;
    counts[time] = (counts[time] || 0) + 1;
  }

  const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);
  if (duplicates.length === 0) {
    console.log("No duplicate scheduled_at times found in the current send_queue table!");
  } else {
    console.log("Found duplicate scheduled_at times in current queue:", duplicates);
  }

  // Let's also check if there are duplicate contact_ids or client_codes
  const contactCounts: Record<string, number> = {};
  for (const item of queue) {
    if (item.contact_id) {
      contactCounts[item.contact_id] = (contactCounts[item.contact_id] || 0) + 1;
    }
  }
  const duplicateContacts = Object.entries(contactCounts).filter(([_, count]) => count > 1);
  console.log("Duplicate contact_ids in current queue:", duplicateContacts);
}

run().catch(console.error);
