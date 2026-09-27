#!/usr/bin/env node
/**
 * Headless proof-of-work after `npm run connect`.
 * Uploads a payload to sia.storage via @siafoundation/sia-storage,
 * pins it on indexd, downloads it, and SHA-256-compares the bytes.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { Readable } from "node:stream";
import {
  initSia,
  Builder,
  AppKey,
  PinnedObject,
} from "@siafoundation/sia-storage";
import {
  INDEXER_URL,
  APP_KEY_PATH,
  nodeAppMeta,
  hexAppId,
} from "./lib/app-meta.mjs";

const packed = process.argv.includes("--packed");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function bufferToWebStream(buf) {
  return Readable.toWeb(Readable.from(buf));
}

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function loadAppKey() {
  if (!existsSync(APP_KEY_PATH)) {
    console.error(
      `Missing ${APP_KEY_PATH}. Run \`npm run connect\` first and approve the app at sia.storage.`
    );
    process.exit(1);
  }
  const hex = readFileSync(APP_KEY_PATH, "utf8").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(`Expected 32-byte hex app key in ${APP_KEY_PATH}`);
    process.exit(1);
  }
  return new AppKey(Uint8Array.from(Buffer.from(hex, "hex")));
}

function payload() {
  mkdirSync("fixtures", { recursive: true });
  const fixture = "fixtures/sample.bin";
  if (existsSync(fixture)) {
    const data = readFileSync(fixture);
    return { data, label: fixture };
  }
  // ~1 MiB deterministic-looking blob so the run is interesting without a photo.
  const data = randomBytes(1024 * 1024);
  writeFileSync("fixtures/generated.bin", data);
  return { data, label: "fixtures/generated.bin (1 MiB random)" };
}

await initSia();

const appMeta = nodeAppMeta();
const sdk = await new Builder(INDEXER_URL, appMeta).connected(loadAppKey());
if (!sdk) {
  console.error(
    "Builder.connected() returned null. Re-run `npm run connect` — the saved app key may not match this indexer/app id."
  );
  process.exit(1);
}

const { data, label } = payload();
const localHash = sha256(data);

console.log("Indexer:     ", INDEXER_URL);
console.log("App ID:      ", hexAppId());
console.log("Payload:     ", label, `(${data.length} bytes)`);
console.log("SHA-256 in:  ", localHash);

let object;

if (packed) {
  console.log("Mode:        packed upload (small-file slab sharing)");
  const pack = sdk.uploadPacked({ maxInflight: 10 });
  await pack.add(bufferToWebStream(data));
  const objects = await pack.finalize();
  object = objects[0];
} else {
  console.log("Mode:        single upload");
  object = await sdk.upload(new PinnedObject(), bufferToWebStream(data), {
    maxInflight: 10,
  });
}

if (typeof object.updateMetadata === "function") {
  object.updateMetadata(
    new TextEncoder().encode(
      JSON.stringify({
        "File Name": label,
        source: "lantern-storage-demo",
      })
    )
  );
}

await sdk.pinObject(object);

const objectId = typeof object.id === "function" ? object.id() : object.id;
const size = typeof object.size === "function" ? object.size() : object.size;

console.log("Object ID:   ", objectId);
console.log("Pinned size: ", String(size));

const downloaded = await collectStream(sdk.download(object));
const remoteHash = sha256(downloaded);

console.log("SHA-256 out: ", remoteHash);
console.log("Bytes match: ", localHash === remoteHash && downloaded.length === data.length);

writeFileSync(
  ".lantern-last-object.json",
  JSON.stringify(
    {
      indexer: INDEXER_URL,
      appId: hexAppId(),
      objectId: String(objectId),
      bytes: data.length,
      sha256: localHash,
      packed,
      at: new Date().toISOString(),
    },
    null,
    2
  ) + "\n"
);

if (localHash !== remoteHash) {
  writeFileSync("downloaded.bin", downloaded);
  console.error("Integrity check failed. Wrote downloaded.bin for inspection.");
  process.exit(1);
}

console.log("\nOK — upload, pin, and download succeeded against indexd.");
