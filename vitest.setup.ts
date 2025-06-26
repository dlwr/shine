import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import { vi } from "vitest";

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
  globalThis.TextDecoder =
    TextDecoder as unknown as typeof globalThis.TextDecoder;
}

// Mock Cloudflare Workers Cache API
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn().mockResolvedValue(false), // Default return false for delete
  keys: vi.fn().mockResolvedValue([]),
};

// Global caches mock
Object.defineProperty(globalThis, "caches", {
  value: {
    default: mockCache,
    open: vi.fn().mockResolvedValue(mockCache),
  },
  writable: true,
});

// Mock console methods to reduce noise in tests
globalThis.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

// Mock fetch for external API calls
globalThis.fetch = vi.fn();

// Mock btoa/atob for base64 encoding in Node.js environment
if (!globalThis.btoa) {
  globalThis.btoa = (input: string) =>
    Buffer.from(input, "binary").toString("base64");
}

if (!globalThis.atob) {
  globalThis.atob = (input: string) =>
    Buffer.from(input, "base64").toString("binary");
}
