import { describe, expect, it } from "vitest";
import { calculatorTool } from "../src/agent/tools/calculator.js";

describe("calculatorTool", () => {
  it("resuelve expresiones matemáticas simples", async () => {
    const result = await calculatorTool.invoke({ expression: "240 * 0.25" });
    expect(result).toBe("60");
  });
});
