import { describe, expect, it, vi } from "vitest";
import { runAgent } from "../src/agent/runAgent.js";

describe("runAgent", () => {
  it("retorna output cuando el executor responde", async () => {
    const executor = {
      invoke: vi.fn().mockResolvedValue({ output: "resultado de prueba" })
    };

    const output = await runAgent("pregunta", { executor });

    expect(executor.invoke).toHaveBeenCalledWith({ input: "pregunta" });
    expect(output).toBe("resultado de prueba");
  });
});
