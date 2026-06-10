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
  console.log("Querying function definition for claim_send_queue_items...");

  const { data, error } = await supabase.rpc("claim_send_queue_items", {
    limit_val: 1,
    now_str: new Date().toISOString()
  });

  if (error) {
    console.error("RPC call failed:", error.message);
  } else {
    console.log("RPC call was successful. Returned items count:", data?.length || 0);
  }

  // Query function source code
  const { data: funcData, error: funcError } = await supabase
    .from("pg_proc" as any)
    .select("proname, prosrc" as any)
    .eq("proname" as any, "claim_send_queue_items");

  if (funcError) {
    console.error("Failed to query catalog via table:", funcError.message);
  } else {
    console.log("Functions found in catalog:", funcData);
  }

  // Let's run a raw SQL query using a Postgres catalog query via RPC if possible, 
  // or we can select from information_schema routines.
  const { data: routines, error: rError } = await supabase
    .from("pg_catalog.pg_proc" as any)
    .select("*" as any)
    .eq("proname" as any, "claim_send_queue_items");
    
  console.log("Routines:", routines, rError);
}

run().catch(console.error);
