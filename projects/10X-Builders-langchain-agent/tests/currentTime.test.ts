import { describe, expect, it } from "vitest";
import { currentTimeTool } from "../src/agent/tools/currentTime.js";

describe("currentTimeTool", () => {
  it("devuelve hora en formato HH:MM:SS cuando no se pasan parámetros", async () => {
    const result = await currentTimeTool.invoke({});
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}/);
    expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("devuelve solo hora con includeDate: false", async () => {
    const result = await currentTimeTool.invoke({ includeDate: false });
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}/);
    expect(result).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("devuelve fecha y hora con includeDate: true", async () => {
    const result = await currentTimeTool.invoke({ includeDate: true });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
