import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getEnv } from "../../config/env.js";

// --- Interfaces for SerpApi Google Flights response ---

interface Airport {
  name: string;
  id: string;
  time: string;
}

interface FlightLeg {
  departure_airport: Airport;
  arrival_airport: Airport;
  duration: number;
  airline: string;
  flight_number: string;
}

interface FlightGroup {
  flights: FlightLeg[];
  total_duration: number;
  price: number;
  type: string;
}

interface SerpApiFlightsResponse {
  best_flights?: FlightGroup[];
  other_flights?: FlightGroup[];
  error?: string;
}

// --- Helpers ---

const SERPAPI_BASE_URL = "https://serpapi.com/search";
const MAX_RESULTS = 5;

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatFlightGroup(group: FlightGroup, index: number, currency: string): string {
  const firstLeg = group.flights[0];
  const lastLeg = group.flights[group.flights.length - 1];
  const airlines = [...new Set(group.flights.map((l) => l.airline))].join(", ");
  const stops = group.flights.length - 1;
  const stopsLabel = stops === 0 ? "directo" : `${stops} escala${stops > 1 ? "s" : ""}`;

  return [
    `Vuelo ${index + 1} — ${airlines} | $${group.price} ${currency} | ${formatDuration(group.total_duration)} | ${stopsLabel}`,
    `  Salida: ${firstLeg.departure_airport.id} ${firstLeg.departure_airport.time} → Llegada: ${lastLeg.arrival_airport.id} ${lastLeg.arrival_airport.time}`,
  ].join("\n");
}

// --- Zod schema ---

const flightsSchema = z.object({
  origin: z
    .string()
    .describe(
      "Código IATA del aeropuerto de origen (ej: BOG, MIA, JFK). Si el usuario no lo especifica, inferir del contexto o asumir el más probable.",
    ),
  destination: z
    .string()
    .describe("Código IATA del aeropuerto de destino (ej: NRT, CDG, LHR)."),
  departureDate: z
    .string()
    .optional()
    .describe(
      "Fecha de salida en formato YYYY-MM-DD. Usar current_time con includeDate: true para convertir fechas relativas.",
    ),
  returnDate: z
    .string()
    .optional()
    .describe("Fecha de regreso en formato YYYY-MM-DD. Si se omite, se busca solo ida."),
  adults: z.number().optional().default(1).describe("Número de pasajeros adultos."),
  currency: z.string().optional().default("USD").describe("Moneda para los precios."),
});

// --- Tool ---

export const flightsTool = tool(
  async ({ origin, destination, departureDate, returnDate, adults, currency }) => {
    const params = new URLSearchParams({
      engine: "google_flights",
      hl: "es",
      api_key: getEnv().SERPAPI_KEY,
      departure_id: origin,
      arrival_id: destination,
      type: returnDate ? "1" : "2",
      adults: String(adults),
      currency,
    });

    if (departureDate) {
      params.set("outbound_date", departureDate);
    }
    if (returnDate) {
      params.set("return_date", returnDate);
    }

    try {
      const response = await fetch(`${SERPAPI_BASE_URL}?${params.toString()}`);

      if (!response.ok) {
        return `Error al buscar vuelos: la API respondió con estado ${response.status}.`;
      }

      const data = (await response.json()) as SerpApiFlightsResponse;

      if (data.error) {
        return `Error al buscar vuelos: ${data.error}`;
      }

      const flights =
        (data.best_flights?.length ? data.best_flights : data.other_flights) ?? [];

      if (flights.length === 0) {
        const dateInfo = departureDate ? ` para la fecha ${departureDate}` : "";
        return `No se encontraron vuelos de ${origin} a ${destination}${dateInfo}.`;
      }

      return flights
        .slice(0, MAX_RESULTS)
        .map((group, i) => formatFlightGroup(group, i, currency))
        .join("\n\n");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error al buscar vuelos: ${message}`;
    }
  },
  {
    name: "flights",
    description:
      "Busca vuelos reales usando Google Flights vía SerpApi. Retorna los mejores vuelos encontrados con aerolínea, precio, duración y escalas. Códigos IATA comunes: BOG (Bogotá), MIA (Miami), JFK (Nueva York), NRT (Tokio), CDG (París), LHR (Londres).",
    schema: flightsSchema,
  },
);
