import { webcrypto } from "node:crypto";

// Polyfill Web Crypto API for Node.js environment
if (!globalThis.crypto) {
  // @ts-expect-error: webcrypto is not typed
  globalThis.crypto = webcrypto;
}
