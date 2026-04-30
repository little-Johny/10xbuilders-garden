import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let saverPromise: Promise<PostgresSaver> | null = null;

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!saverPromise) {
    saverPromise = (async () => {
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          "DATABASE_URL is not set. LangGraph checkpointing needs a direct Postgres connection (Supabase session pooler on port 5432, not the transaction pooler — advisory locks must survive the resume)."
        );
      }
      const saver = PostgresSaver.fromConnString(url);
      await saver.setup();
      return saver;
    })().catch((err) => {
      saverPromise = null;
      throw err;
    });
  }
  return saverPromise;
}
