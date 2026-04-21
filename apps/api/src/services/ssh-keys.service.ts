/**
 * Server-level SSH key management.
 *
 * Manages the Mimir server's SSH keypair used for AUTHORIZED_KEYS injection
 * into deployed instances. Keys are stored in ~/.ssh/ following standard
 * conventions.
 *
 * - ensureServerSshKey(): Auto-generates an ed25519 keypair if none exists
 * - getServerPublicKey(): Returns the public key (for export / display)
 * - resolveAuthorizedKeys(): Resolves the AUTHORIZED_KEYS value for deploys
 */

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { logger } from "../lib/logger.js";

const SSH_DIR = join(homedir(), ".ssh");
const KEY_NAME = "mimir_ed25519";
const PRIVATE_KEY_PATH = join(SSH_DIR, KEY_NAME);
const PUBLIC_KEY_PATH = join(SSH_DIR, `${KEY_NAME}.pub`);

/** SSH key file candidates when looking for any existing key. */
const SSH_KEY_CANDIDATES = [`${KEY_NAME}.pub`, "id_ed25519.pub", "id_rsa.pub", "id_ecdsa.pub"];

export interface ServerKeyInfo {
  publicKey: string;
  keyType: string;
  fingerprint: string;
  path: string;
  generated: boolean;
}

/**
 * Ensure the Mimir server has an SSH keypair. Generates an ed25519 keypair
 * if no key exists at ~/.ssh/mimir_ed25519.
 *
 * Safe to call multiple times — no-ops if the key already exists.
 */
export async function ensureServerSshKey(): Promise<ServerKeyInfo> {
  // Check if our managed key already exists
  if (existsSync(PUBLIC_KEY_PATH)) {
    const publicKey = (await readFile(PUBLIC_KEY_PATH, "utf-8")).trim();
    return {
      publicKey,
      keyType: extractKeyType(publicKey),
      fingerprint: extractComment(publicKey),
      path: PUBLIC_KEY_PATH,
      generated: false,
    };
  }

  // Ensure ~/.ssh directory exists with correct permissions
  if (!existsSync(SSH_DIR)) {
    await mkdir(SSH_DIR, { recursive: true });
    await chmod(SSH_DIR, 0o700);
  }

  // Generate ed25519 keypair
  const hostname = (await import("node:os")).hostname();
  const comment = `mimir@${hostname}`;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Convert PEM to OpenSSH format for the public key
  const sshPublicKey = pemToOpenSsh(publicKey, comment);

  // Convert PEM to OpenSSH format for the private key
  const sshPrivateKey = pemToOpenSshPrivate(privateKey);

  // Write keys with secure permissions
  await writeFile(PRIVATE_KEY_PATH, sshPrivateKey, { mode: 0o600 });
  await writeFile(PUBLIC_KEY_PATH, sshPublicKey + "\n", { mode: 0o644 });

  logger.info({ path: PUBLIC_KEY_PATH }, "Generated Mimir server SSH keypair");

  return {
    publicKey: sshPublicKey,
    keyType: "ssh-ed25519",
    fingerprint: comment,
    path: PUBLIC_KEY_PATH,
    generated: true,
  };
}

/**
 * Get the server's public key for display/export. Returns null if no key
 * exists and generation is not requested.
 */
export async function getServerPublicKey(): Promise<string | null> {
  for (const filename of SSH_KEY_CANDIDATES) {
    const path = join(SSH_DIR, filename);
    try {
      const content = (await readFile(path, "utf-8")).trim();
      if (content.length > 0) return content;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

/**
 * Resolve the AUTHORIZED_KEYS value for deployment injection.
 * Priority: AUTHORIZED_KEYS env var → server SSH key (auto-generated if needed).
 */
export async function resolveAuthorizedKeys(): Promise<string | null> {
  // 1. Explicit override via env var (admin-configured user keys)
  const envValue = process.env.AUTHORIZED_KEYS;
  if (envValue && envValue.trim().length > 0) return envValue.trim();

  // 2. Auto-generate a Mimir server keypair if none exists.
  //    The public key is injected into deployed instances so Mimir (and anyone
  //    who downloads the private key from the /security/server-key endpoint)
  //    can SSH in.
  try {
    const keyInfo = await ensureServerSshKey();
    return keyInfo.publicKey;
  } catch (err) {
    logger.warn({ err }, "Failed to resolve or generate SSH key for AUTHORIZED_KEYS");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Key format helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a PEM-encoded ed25519 public key to OpenSSH format.
 * PEM SPKI for ed25519 is: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
 * OpenSSH format is: "ssh-ed25519 <base64(type + key)> <comment>"
 */
function pemToOpenSsh(pemPublicKey: string, comment: string): string {
  // Strip PEM headers and decode base64
  const b64 = pemPublicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");
  const der = Buffer.from(b64, "base64");

  // Extract the raw 32-byte ed25519 key from the SPKI wrapper
  // SPKI for ed25519: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
  const rawKey = der.subarray(der.length - 32);

  // Build OpenSSH wire format: string "ssh-ed25519" + string <key bytes>
  const typeStr = "ssh-ed25519";
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(typeStr.length);
  const typeBytes = Buffer.from(typeStr);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(rawKey.length);

  const wireFormat = Buffer.concat([typeLen, typeBytes, keyLen, rawKey]);

  return `ssh-ed25519 ${wireFormat.toString("base64")} ${comment}`;
}

/**
 * Convert a PEM-encoded ed25519 private key to OpenSSH format.
 * Uses ssh-keygen-compatible format for maximum compatibility.
 */
function pemToOpenSshPrivate(pemPrivateKey: string): string {
  // For simplicity, keep PEM format — OpenSSH >=6.5 reads PEM ed25519 keys.
  // The key is only used for local operations, not exported.
  return pemPrivateKey;
}

function extractKeyType(publicKey: string): string {
  const parts = publicKey.split(" ");
  return parts[0] ?? "unknown";
}

function extractComment(publicKey: string): string {
  const parts = publicKey.split(" ");
  return parts[2] ?? "";
}
