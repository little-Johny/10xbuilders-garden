import { runAgent } from "./agent/runAgent.js";

async function main(): Promise<void> {
  const input =
    process.argv.slice(2).join(" ").trim() ||
    "¿Cuánto es el 25% de 240 y qué hora es ahora?";

  const output = await runAgent(input, { verbose: true });
  console.log("\nRespuesta del agente:\n");
  console.log(output);
}

main().catch((error) => {
  console.error("Error ejecutando el agente:", error);
  process.exit(1);
});
