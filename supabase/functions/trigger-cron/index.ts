// supabase/functions/trigger-cron/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  // O ideal é que esta URL venha de uma variável de ambiente também
  const APP_URL = Deno.env.get("APP_URL") || "https://avisei.erriesse.com/cron-trigger";

  console.log(`[cron-trigger] Iniciando chamada para ${APP_URL}`);

  try {
    const url = new URL(APP_URL);
    url.searchParams.set("secret", CRON_SECRET || "");

    console.log(`[cron-trigger] Chamando: ${url.toString()}`);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const status = res.status;
    const data = await res.json();

    console.log(`[cron-trigger] Resposta recebida (${status}):`, JSON.stringify(data));

    return new Response(JSON.stringify({ 
      success: res.ok, 
      status, 
      data 
    }), { 
      headers: { "Content-Type": "application/json" },
      status: res.ok ? 200 : 500
    });
  } catch (err: any) {
    console.error(`[cron-trigger] Erro na requisição:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
})
