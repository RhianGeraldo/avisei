import dotenv from "dotenv";
dotenv.config();
import { runCronTick } from "./src/lib/cron";

async function test() {
  console.log("Iniciando teste de cron manual...");
  try {
    const result = await runCronTick({ onlyJobId: "a9a46e59-17ee-411f-8d26-ff591c0fe4bb" });
    console.log("Resultado:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Erro no teste:", err);
  }
}

test();
