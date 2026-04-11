import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { flightsTool } from "../src/agent/tools/flights.js";

vi.mock("../src/config/env.js", () => ({
  getEnv: () => ({ SERPAPI_KEY: "test-key" }),
}));

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function makeFlightGroup(overrides: Record<string, unknown> = {}) {
  return {
    flights: [
      {
        departure_airport: { name: "El Dorado", id: "BOG", time: "2026-04-15 06:00" },
        arrival_airport: { name: "Narita", id: "NRT", time: "2026-04-15 22:30" },
        duration: 990,
        airline: "Avianca",
        flight_number: "AV 123",
      },
    ],
    total_duration: 990,
    price: 450,
    type: "One way",
    ...overrides,
  };
}

describe("flightsTool", () => {
  const originalFetch = globalThis.fetch;
  const fetchSpy = vi.fn<typeof fetch>();

  beforeEach(() => {
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    fetchSpy.mockReset();
    globalThis.fetch = originalFetch;
  });

  it("retorna vuelos formateados de best_flights", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        best_flights: [makeFlightGroup(), makeFlightGroup({ price: 520, flights: [
          {
            departure_airport: { name: "El Dorado", id: "BOG", time: "2026-04-15 10:00" },
            arrival_airport: { name: "Narita", id: "NRT", time: "2026-04-16 08:15" },
            duration: 1215,
            airline: "LATAM",
            flight_number: "LA 456",
          },
        ], total_duration: 1215 })],
        other_flights: [],
      }),
    );

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT", departureDate: "2026-04-15" });

    expect(result).toContain("Vuelo 1");
    expect(result).toContain("Avianca");
    expect(result).toContain("$450 USD");
    expect(result).toContain("Vuelo 2");
    expect(result).toContain("LATAM");
    expect(result).toContain("$520 USD");
  });

  it("usa other_flights como fallback cuando best_flights está vacío", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        best_flights: [],
        other_flights: [makeFlightGroup({ price: 600 })],
      }),
    );

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    expect(result).toContain("Vuelo 1");
    expect(result).toContain("$600 USD");
  });

  it("retorna mensaje claro cuando no hay vuelos", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [], other_flights: [] }),
    );

    const result = await flightsTool.invoke({
      origin: "BOG",
      destination: "NRT",
      departureDate: "2026-04-15",
    });

    expect(result).toBe("No se encontraron vuelos de BOG a NRT para la fecha 2026-04-15.");
  });

  it("retorna mensaje claro sin fecha cuando no hay vuelos y no se indicó fecha", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [], other_flights: [] }),
    );

    const result = await flightsTool.invoke({ origin: "BOG", destination: "XYZ" });

    expect(result).toBe("No se encontraron vuelos de BOG a XYZ.");
  });

  it("maneja error de la API (status no ok)", async () => {
    fetchSpy.mockResolvedValueOnce(makeFetchResponse({}, 500));

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    expect(result).toBe("Error al buscar vuelos: la API respondió con estado 500.");
  });

  it("maneja error de red (fetch lanza excepción)", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    expect(result).toBe("Error al buscar vuelos: Network error");
  });

  it("maneja error reportado en el body de SerpApi", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ error: "Invalid API key." }),
    );

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    expect(result).toBe("Error al buscar vuelos: Invalid API key.");
  });

  it("usa type=2 (solo ida) cuando no hay returnDate", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [makeFlightGroup()] }),
    );

    await flightsTool.invoke({ origin: "BOG", destination: "NRT", departureDate: "2026-04-15" });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.get("type")).toBe("2");
    expect(params.has("return_date")).toBe(false);
  });

  it("usa type=1 (ida y vuelta) cuando hay returnDate", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [makeFlightGroup()] }),
    );

    await flightsTool.invoke({
      origin: "BOG",
      destination: "NRT",
      departureDate: "2026-04-15",
      returnDate: "2026-04-22",
    });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.get("type")).toBe("1");
    expect(params.get("return_date")).toBe("2026-04-22");
    expect(params.get("outbound_date")).toBe("2026-04-15");
  });

  it("envía parámetros fijos correctos (engine, hl, api_key)", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [makeFlightGroup()] }),
    );

    await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.get("engine")).toBe("google_flights");
    expect(params.get("hl")).toBe("es");
    expect(params.get("api_key")).toBe("test-key");
    expect(params.get("departure_id")).toBe("BOG");
    expect(params.get("arrival_id")).toBe("NRT");
  });

  it("muestra escalas correctamente para vuelos con múltiples tramos", async () => {
    const multiLeg = makeFlightGroup({
      flights: [
        {
          departure_airport: { name: "El Dorado", id: "BOG", time: "2026-04-15 06:00" },
          arrival_airport: { name: "Miami Intl", id: "MIA", time: "2026-04-15 10:00" },
          duration: 240,
          airline: "Avianca",
          flight_number: "AV 100",
        },
        {
          departure_airport: { name: "Miami Intl", id: "MIA", time: "2026-04-15 12:00" },
          arrival_airport: { name: "Narita", id: "NRT", time: "2026-04-16 08:00" },
          duration: 960,
          airline: "ANA",
          flight_number: "NH 200",
        },
      ],
      total_duration: 1320,
      price: 780,
    });

    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({ best_flights: [multiLeg] }),
    );

    const result = await flightsTool.invoke({ origin: "BOG", destination: "NRT" });

    expect(result).toContain("1 escala");
    expect(result).toContain("Avianca, ANA");
    expect(result).toContain("BOG 2026-04-15 06:00");
    expect(result).toContain("NRT 2026-04-16 08:00");
  });
});
