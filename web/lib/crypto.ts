import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM for Golfistics passwords at rest. Key: GOLFLET_CRED_KEY (base64, 32 bytes). */
function key(): Buffer {
  const raw = process.env.GOLFLET_CRED_KEY;
  if (!raw) throw new Error("GOLFLET_CRED_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("GOLFLET_CRED_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1") throw new Error("unknown credential format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
