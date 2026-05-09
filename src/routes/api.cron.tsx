import { createAPIFileRoute } from "@tanstack/react-start/api";
import { runCronTick } from "@/lib/cron";

export const Route = createAPIFileRoute("/api/cron")({
  POST: async ({ request }) => {
    const CRON_SECRET = process.env.CRON_SECRET;
    
    // Tenta pegar a secret do header ou do body
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    
    if (!CRON_SECRET || authHeader !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      console.log("[api/cron] Gatilho recebido, executando tick...");
      const result = await runCronTick({ skipShouldRun: false });
      
      return new Response(JSON.stringify({
        success: true,
        ran: result.ran,
        results: result.results,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.error("[api/cron] Falha no tick:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
