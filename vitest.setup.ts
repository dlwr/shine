import {webcrypto} from 'node:crypto';
import {TextDecoder, TextEncoder} from 'node:util';
import '@testing-library/jest-dom';
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

// Mock HTMLFormElement.prototype.requestSubmit for jsdom
// This mock needs to be available globally for all test environments
if (typeof globalThis !== 'undefined' && (globalThis as any).HTMLFormElement) {
	(globalThis as any).HTMLFormElement.prototype.requestSubmit = function () {
		this.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
	};
}

// Window.locationのモック（テスト環境用）
if ((globalThis as any).window !== undefined) {
	Object.defineProperty(globalThis, 'location', {
		value: {
			href: 'http://localhost:3000/',
			origin: 'http://localhost:3000',
			protocol: 'http:',
			host: 'localhost:3000',
			hostname: 'localhost',
			port: '3000',
			pathname: '/',
			search: '',
			hash: '',
		},
		writable: true,
	});
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
if (!globalThis.btoa) {
	globalThis.btoa = (input: string) =>
		Buffer.from(input, 'binary').toString('base64');
}

if (!globalThis.atob) {
	globalThis.atob = (input: string) =>
		Buffer.from(input, 'base64').toString('binary');
}
