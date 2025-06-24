import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";

// Polyfill Web Crypto API for Node.js environment
if (!globalThis.crypto) {
  // @ts-expect-error: webcrypto is not typed
  globalThis.crypto = webcrypto;
}

// Polyfill TextEncoder and TextDecoder for jsdom environment
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  // @ts-expect-error: Node.js TextDecoder type compatibility
  globalThis.TextDecoder = TextDecoder;
}
