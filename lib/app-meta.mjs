import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const INDEXER_URL = process.env.SIA_INDEXER_URL ?? "https://sia.storage";
export const APP_ID_PATH = ".lantern-app-id";
export const APP_KEY_PATH = ".lantern-app-key";

/** Stable 32-byte app id. Generated once and reused. Not secret. */
export function loadOrCreateAppId() {
  if (existsSync(APP_ID_PATH)) {
    const hex = readFileSync(APP_ID_PATH, "utf8").trim();
    return Buffer.from(hex, "hex");
  }
  const id = randomBytes(32);
  writeFileSync(APP_ID_PATH, id.toString("hex") + "\n", { mode: 0o644 });
  return id;
}

export function nodeAppMeta() {
  return {
    id: loadOrCreateAppId(),
    name: "Lantern Storage Demo",
    description: "Ghost adapter proof-of-work: upload, pin, download via official Sia Storage SDK + indexd",
    serviceUrl: "https://github.com/robwynden/lantern-storage-demo",
  };
}

export function hexAppId() {
  return loadOrCreateAppId().toString("hex");
}
