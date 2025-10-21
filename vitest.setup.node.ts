import {webcrypto} from 'node:crypto';
import {vi} from 'vitest';

// Polyfill Web Crypto API for Node.js environment
if (globalThis.crypto) {
  // Ensure crypto.subtle is available in the existing crypto object
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: webcrypto.subtle,
      writable: false,
      configurable: false,
    });
  }
} else {
  // @ts-expect-error: webcrypto is not typed
  globalThis.crypto = webcrypto;
}

// TextEncoder and TextDecoder are already global in Node.js 18+

// Mock Cloudflare Workers Cache API for Node.js tests
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn().mockResolvedValue(false), // Default return false for delete
  keys: vi.fn().mockResolvedValue([]),
};

// Global caches mock
Object.defineProperty(globalThis, 'caches', {
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
globalThis.btoa ||= (input: string) =>
  Buffer.from(input, 'binary').toString('base64');

globalThis.atob ||= (input: string) =>
  Buffer.from(input, 'base64').toString('binary');
