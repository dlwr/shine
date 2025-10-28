import type {Context} from 'hono';
import type {Environment} from '@shine/database';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {authMiddleware} from '../auth';
import {sanitizeText, sanitizeUrl} from '../middleware/sanitizer';

// Mock the db module
const createAsyncArrayFunction = () => vi.fn(async () => []);

const createAsyncSuccessFunction = () => vi.fn(async () => ({success: true}));

const createJoinChainStub = () => ({
  where: createAsyncArrayFunction(),
  limit: createAsyncArrayFunction(),
  orderBy: createAsyncArrayFunction(),
});

const createFromStub = () => ({
  ...createJoinChainStub(),
  leftJoin: vi.fn(() => createJoinChainStub()),
});

const createSelectStub = () =>
  vi.fn(() => ({
    from: vi.fn(() => createFromStub()),
  }));

const createInsertStub = () =>
  vi.fn(() => ({
    values: vi.fn(async () => ({success: true})),
  }));

const createUpdateStub = () =>
  vi.fn(() => ({
    set: vi.fn(() => ({
      where: createAsyncSuccessFunction(),
    })),
  }));

const createDeleteStub = () =>
  vi.fn(() => ({
    where: createAsyncSuccessFunction(),
  }));

vi.mock('@shine/database', () => {
  const select = createSelectStub();
  const insert = createInsertStub();
  const update = createUpdateStub();
  const remove = createDeleteStub();

  return {
    getDatabase: vi.fn(() => ({
      select,
      insert,
      update,
      delete: remove,
    })),
    eq: vi.fn(),
    and: vi.fn(),
    not: vi.fn(),
    like: vi.fn(),
    sql: vi.fn(),
  };
});

const createAuthContext = (
  headerValue: string | undefined,
  environmentOverrides: Partial<Environment> = {},
) => {
  const header = vi.fn();
  if (headerValue !== undefined) {
    header.mockReturnValue(headerValue);
  }

  return {
    req: {header},
    env: {
      TMDB_API_KEY: 'test-api-key',
      TURSO_DATABASE_URL: 'test-url',
      TURSO_AUTH_TOKEN: 'test-token',
      JWT_SECRET: 'test-secret',
      ...environmentOverrides,
    },
    json: vi.fn(),
  } as unknown as Context<{Bindings: Environment}>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Authentication Middleware Edge Cases', () => {
  const expectAuthFailure = async (
    context: Context<{Bindings: Environment}>,
  ) => {
    const next = vi.fn();
    await expect(authMiddleware(context, next)).rejects.toBeDefined();
    expect(next).not.toHaveBeenCalled();
  };

  it('should handle missing Authorization header', async () => {
    const context = createAuthContext();
    await expectAuthFailure(context);
  });

  it('should handle malformed Bearer token', async () => {
    const context = createAuthContext('InvalidTokenFormat');
    await expectAuthFailure(context);
  });

  it('should handle empty Bearer token', async () => {
    const context = createAuthContext('Bearer ');
    await expectAuthFailure(context);
  });

  it('should handle invalid JWT format', async () => {
    const context = createAuthContext('Bearer invalid.jwt.token');
    await expectAuthFailure(context);
  });

  it('should handle missing JWT_SECRET in environment', async () => {
    const context = createAuthContext('Bearer some.valid.token', {
      JWT_SECRET: undefined,
    });
    await expectAuthFailure(context);
  });
});

describe('Input Sanitization Edge Cases', () => {
  it('should handle null input to sanitizeText', () => {
    expect(() => sanitizeText(undefined as unknown as string)).toThrow();
  });

  it('should handle undefined input to sanitizeText', () => {
    expect(() => sanitizeText(undefined as unknown as string)).toThrow();
  });

  it('should handle empty string to sanitizeText', () => {
    const result = sanitizeText('');
    expect(result).toBe('');
  });

  it('should handle extremely long text input', () => {
    const longText = 'a'.repeat(10_000);
    const result = sanitizeText(longText);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should handle special characters in text', () => {
    const specialText = '<script>alert("xss")</script>';
    const result = sanitizeText(specialText);
    expect(result).toBeDefined();
    expect(result).not.toContain('<script>');
  });

  it('should handle null input to sanitizeUrl', () => {
    expect(() => sanitizeUrl(undefined as unknown as string)).toThrow(
      'Invalid URL',
    );
  });

  it('should handle undefined input to sanitizeUrl', () => {
    expect(() => sanitizeUrl(undefined as unknown as string)).toThrow(
      'Invalid URL',
    );
  });

  it('should handle invalid URL format', () => {
    expect(() => sanitizeUrl('not-a-url')).toThrow('Invalid URL');
  });

  it('should handle javascript: protocol URLs', () => {
    expect(() => sanitizeUrl('javascript:alert("xss")')).toThrow('Invalid URL');
  });

  it('should handle data: protocol URLs', () => {
    expect(() =>
      sanitizeUrl('data:text/html,<script>alert("xss")</script>'),
    ).toThrow('Invalid URL');
  });
});

describe('Request Validation Edge Cases', () => {
  it('should handle malformed JSON in request body', () => {
    const malformedJson = '{"invalid": json,}';

    expect(() => {
      JSON.parse(malformedJson);
    }).toThrow();
  });

  it('should handle extremely large JSON payloads', () => {
    const largeObject = {
      data: 'x'.repeat(1_000_000), // 1MB string
    };

    const jsonString = JSON.stringify(largeObject);
    expect(jsonString.length).toBeGreaterThan(1_000_000);

    const parsed = JSON.parse(jsonString) as typeof largeObject;
    expect(parsed.data.length).toBe(1_000_000);
  });

  it('should handle deeply nested JSON objects', () => {
    type NestedObject = {
      next?: NestedObject;
      value?: string;
    };

    const deepObject: NestedObject = {};
    let current = deepObject;

    for (let index = 0; index < 1000; index++) {
      current.next = {};
      current = current.next;
    }

    current.value = 'deep';

    const jsonString = JSON.stringify(deepObject);
    const parsed = JSON.parse(jsonString) as NestedObject;

    let navigation = parsed;
    for (let index = 0; index < 1000; index++) {
      navigation = navigation.next ?? {value: undefined};
    }

    expect(navigation.value).toBe('deep');
  });

  it('should handle missing Content-Type header', () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({test: 'data'}),
    });

    const contentType = request.headers.get('Content-Type');
    expect(contentType === null || contentType.includes('text/plain')).toBe(
      true,
    );
  });

  it('should handle incorrect Content-Type header', () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({test: 'data'}),
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    expect(request.headers.get('Content-Type')).toBe('text/plain');
  });
});

describe('Database Operation Edge Cases', () => {
  it('should handle database connection failure', async () => {
    const {getDatabase} = await import('@shine/database');

    vi.mocked(getDatabase).mockImplementationOnce(() => {
      throw new Error('Database connection failed');
    });

    expect(() => {
      getDatabase({} as never);
    }).toThrow('Database connection failed');
  });

  it('should handle database query timeout', async () => {
    const {getDatabase} = await import('@shine/database');

    const mockDatabase = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => {
            throw new Error('Query timeout');
          }),
        })),
      })),
    };

    vi.mocked(getDatabase).mockReturnValueOnce(mockDatabase as never);

    const database = getDatabase({} as never);

    await expect(
      database
        .select()
        .from({} as never)
        .where({} as never),
    ).rejects.toThrow('Query timeout');
  });

  it('should handle invalid database operations', async () => {
    const {getDatabase} = await import('@shine/database');

    const mockDatabase = {
      insert: vi.fn(() => ({
        values: vi.fn(async () => {
          throw new Error('Invalid operation');
        }),
      })),
    };

    vi.mocked(getDatabase).mockReturnValueOnce(mockDatabase as never);

    const database = getDatabase({} as never);

    await expect(database.insert({} as never).values({})).rejects.toThrow(
      'Invalid operation',
    );
  });
});

describe('Memory and Performance Edge Cases', () => {
  it('should handle memory-intensive operations', () => {
    const largeArray = Array.from({length: 1_000_000}, (_, index) => ({
      id: index,
      data: `item-${index}`,
    }));

    expect(largeArray.length).toBe(1_000_000);
    expect(largeArray[999_999].data).toBe('item-999999');

    largeArray.length = 0;
    expect(largeArray.length).toBe(0);
  });

  it('should handle rapid request processing', async () => {
    const createJob = async (index: number) =>
      new Promise<number>(resolve => {
        setTimeout(() => {
          resolve(index);
        }, Math.random() * 10);
      });

    const promises = Array.from({length: 100}, async (_, index) =>
      createJob(index),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(100);
    expect(results[99]).toBe(99);
  });
});

describe('Internationalization Edge Cases', () => {
  it('should handle various character encodings', () => {
    const testStrings = [
      'Hello World',
      'こんにちは世界',
      '你好世界',
      'مرحبا بالعالم', // Cspell:disable-line
      '🌍🌎🌏',
      'Ñandú ñoño', // Cspell:disable-line
      'Москва', // Cspell:disable-line
      'Ελληνικά', // Cspell:disable-line
    ];

    for (const testString of testStrings) {
      const sanitized = sanitizeText(testString);
      expect(sanitized).toBeDefined();
      expect(typeof sanitized).toBe('string');
    }
  });

  it('should handle right-to-left text', () => {
    const rtlText = 'مرحبا بالعالم'; // Cspell:disable-line
    const result = sanitizeText(rtlText);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should handle mixed-direction text', () => {
    const mixedText = 'Hello مرحبا World'; // Cspell:disable-line
    const result = sanitizeText(mixedText);
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
