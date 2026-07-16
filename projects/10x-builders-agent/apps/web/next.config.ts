import type { NextConfig } from "next";
import path from "node:path";

const extraAllowedDevOrigins =
  process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
    .map((h) => h.trim())
    .filter(Boolean) ?? [];

const allowedDevOrigins = [
  "*.ngrok-free.app",
  "*.ngrok-free.dev",
  "*.ngrok.app",
  "*.ngrok.dev",
  ...extraAllowedDevOrigins,
];

const nextConfig: NextConfig = {
  // Fija la raíz del workspace al paquete del proyecto (projects/10x-builders-agent).
  // Sin esto, un lockfile extraviado (p. ej. ~/package-lock.json) hace que Turbopack
  // infiera el HOME como raíz y escanee/vigile todo el árbol → explosión de memoria.
  turbopack: { root: path.join(__dirname, "..", "..") },
  transpilePackages: ["@agents/agent", "@agents/db", "@agents/types"],
  serverExternalPackages: ["@langchain/core", "@langchain/langgraph", "@langchain/openai"],
  allowedDevOrigins,
};

export default nextConfig;
