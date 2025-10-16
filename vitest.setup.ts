import {webcrypto} from 'node:crypto';
import {vi} from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';

type DomLikeGlobal = typeof globalThis & {
	window?: Window & typeof globalThis;
	HTMLFormElement?: typeof HTMLFormElement;
	HTMLDialogElement?: unknown;
	ResizeObserver?: unknown;
};

const domGlobal = globalThis as DomLikeGlobal;

// Ensure React is available globally for JSX
globalThis.React = React;

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
if (
	domGlobal.window !== undefined &&
	domGlobal.HTMLFormElement &&
	!domGlobal.HTMLFormElement.prototype.requestSubmit
) {
	type SubmitEventLike = Event & { submitter?: HTMLElement | null };

	Object.defineProperty(domGlobal.HTMLFormElement.prototype, 'requestSubmit', {
		value(this: HTMLFormElement, submitter?: HTMLElement | null) {
			const submitEvent = new Event('submit', {
				bubbles: true,
				cancelable: true,
			}) as SubmitEventLike;
			if (submitter) {
				submitEvent.submitter = submitter;
			}

			this.dispatchEvent(submitEvent);
		},
			writable: true,
			configurable: true,
		},
	);
}

// Mock HTMLDialogElement for jsdom
if (domGlobal.window && !domGlobal.HTMLDialogElement) {
	class MockHTMLDialogElement {
		open = false;
		returnValue = '';

		show() {
			this.open = true;
		}

		showModal() {
			this.open = true;
		}

		close(returnValue?: string) {
			this.open = false;
			if (returnValue !== undefined) {
				this.returnValue = returnValue;
			}

			// Dispatch close event
		}

		dispatchEvent(event: Event) {
			void event;
			return true;
		}
	}

	domGlobal.HTMLDialogElement = MockHTMLDialogElement;
}

// Mock ResizeObserver
if (!domGlobal.ResizeObserver) {
	class MockResizeObserver {
		observe() {
			// Mock implementation
		}

		unobserve() {
			// Mock implementation
		}

		disconnect() {
			// Mock implementation
		}
	}

	domGlobal.ResizeObserver = MockResizeObserver;
}

// Window.locationのモック（テスト環境用）
if (domGlobal.window !== undefined) {
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

// TextEncoder and TextDecoder are already global in Node.js 18+

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
globalThis.btoa ||= (input: string) =>
	Buffer.from(input, 'binary').toString('base64');

globalThis.atob ||= (input: string) =>
	Buffer.from(input, 'base64').toString('binary');
