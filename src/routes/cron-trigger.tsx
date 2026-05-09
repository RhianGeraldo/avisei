import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { runCronTick } from "@/lib/cron";

// Função no servidor que executa a lógica
const runCronServerFn = createServerFn({ method: "GET" })
  .validator((secret: string) => secret)
  .handler(async ({ data: secret }) => {
    const CRON_SECRET = process.env.CRON_SECRET;

    if (!CRON_SECRET || secret !== CRON_SECRET) {
      console.error("[cron] Acesso negado: Secret inválida.");
      return { error: "Unauthorized", status: 401 };
    }

    try {
      console.log("[cron] Executando tick via trigger...");
      const result = await runCronTick({ skipShouldRun: false });
      return { success: true, ...result };
    } catch (err: any) {
      console.error("[cron] Erro:", err.message);
      return { error: err.message, status: 500 };
    }
  });

export const Route = createFileRoute("/cron-trigger")({
  loader: async ({ location }) => {
    const secret = location.search.secret as string;
    const result = await runCronServerFn({ data: secret });
    return result;
  },
  component: () => (
    <div className="p-4 font-mono text-sm">
      <h1>Cron Trigger</h1>
      <pre>{JSON.stringify(Route.useLoaderData(), null, 2)}</pre>
    </div>
  ),
});
