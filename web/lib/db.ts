import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
let pool: Pool | null = null;

/** Lazily-created shared pool (pg-compatible, over WebSocket).
 *  t134u: an idle connection dropped by Neon/the network makes the pool emit
 *  'error'; without a listener Node treats it as an uncaught exception and the
 *  whole function instance dies, failing every in-flight request (e.g. /api/data).
 *  We listen, log, and let the pool discard that client. Idle clients are also
 *  recycled quickly so we rarely hold a stale socket. */
export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const p = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
    p.on("error", (e: Error) => { console.error("[db] idle client error (discarded):", e?.message); });
    pool = p;
  }
  return pool;
}

const TRANSIENT = /Connection terminated|terminating connection|ECONNRESET|ETIMEDOUT|socket hang up|Client has encountered a connection error|WebSocket was closed|timeout exceeded when trying to connect/i;

/** True for connection-level failures that are safe to retry once (the query never ran or the socket died). */
export function isTransientDbError(e: unknown): boolean {
  const m = (e as any)?.message || "";
  return TRANSIENT.test(m) || (e as any)?.code === "57P01";
}

export type QueryClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  release?: () => void;
};

/** One connection, one transaction. A thrown error rolls the work back, including a group insert that never reached the ledger. */
export async function withTransaction<T>(fn: (run: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<T>, connect?: () => Promise<QueryClient>): Promise<T> {
  const client = connect ? await connect() : await getPool().connect();
  const run = async (text: string, params: unknown[] = []) => {
    const r = await client.query(text, params);
    if (Array.isArray(r)) return r;
    return r?.rows ?? [];
  };
  try {
    await client.query("BEGIN");
    const out = await fn(run);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* the connection may already be aborted */ }
    throw e;
  } finally {
    client.release?.();
  }
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    const r = await getPool().query(text, params as any[]);
    return r.rows as T[];
  } catch (e) {
    if (!isTransientDbError(e)) throw e;
    console.error("[db] transient error, retrying once:", (e as any)?.message);
    await new Promise(r => setTimeout(r, 150));
    const r = await getPool().query(text, params as any[]);
    return r.rows as T[];
  }
}
