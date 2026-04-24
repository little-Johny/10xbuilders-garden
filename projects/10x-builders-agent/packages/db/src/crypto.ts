import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.OAUTH_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "OAUTH_ENCRYPTION_KEY is not set. Required to (de)cipher third-party tokens."
    );
  }
  // Accept either a 32-byte base64/hex string or any passphrase; derive a
  // deterministic 32-byte key via SHA-256 so rotating the env var invalidates
  // every previously stored ciphertext (which is the intended behaviour).
  return createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Encrypts a UTF-8 plaintext with AES-256-GCM using the key derived from
 * `OAUTH_ENCRYPTION_KEY`. The output is a single compact string that bundles
 * everything needed to decrypt: `v1:<iv_b64>:<tag_b64>:<ct_b64>`.
 *
 * Intentionally server-only: throws at import time in the browser because
 * `node:crypto` is not available there.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Reverse of `encryptSecret`. Throws if the ciphertext was produced with a
 * different key (e.g. after `OAUTH_ENCRYPTION_KEY` rotation) or if the payload
 * has been tampered with (GCM tag mismatch).
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid ciphertext format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Invalid ciphertext: unexpected IV or tag length");
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}
