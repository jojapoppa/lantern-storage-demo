#!/usr/bin/env node
/**
 * One-time (or reconnect) approval against sia.storage.
 * Saves .lantern-app-key so demo.mjs can run headless afterward.
 */

import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  initSia,
  Builder,
  generateRecoveryPhrase,
} from "@siafoundation/sia-storage";
import {
  INDEXER_URL,
  APP_KEY_PATH,
  nodeAppMeta,
  hexAppId,
} from "./lib/app-meta.mjs";

await initSia();

const appMeta = nodeAppMeta();
const builder = new Builder(INDEXER_URL, appMeta);

console.log("Indexer:", INDEXER_URL);
console.log("App ID (hex):", hexAppId());
console.log("Requesting connection…");

await builder.requestConnection();
console.log("\nOpen this URL in a browser and approve the app:\n");
console.log(builder.responseUrl());
console.log("\nWaiting for approval…");

await builder.waitForApproval();

const rl = createInterface({ input, output });
let phrase = (
  await rl.question(
    "\nEnter your sia.storage recovery phrase (or type `seed` to generate a new one): "
  )
).trim();

if (!phrase || phrase === "seed") {
  phrase = generateRecoveryPhrase();
  console.log("\nGenerated recovery phrase (store offline, never commit):\n");
  console.log(phrase);
}

const sdk = await builder.register(phrase);
const appKeyBytes = sdk.appKey().export();
const appKeyHex =
  typeof appKeyBytes.toHex === "function"
    ? appKeyBytes.toHex()
    : Buffer.from(appKeyBytes).toString("hex");

writeFileSync(APP_KEY_PATH, appKeyHex.trim() + "\n", { mode: 0o600 });
console.log(`\nWrote app key to ${APP_KEY_PATH} (gitignored).`);
console.log("Next: npm run demo");

rl.close();
