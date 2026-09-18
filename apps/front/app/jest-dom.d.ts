/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- vitest の Assertion を拡張するだけの宣言 */
import type {TestingLibraryMatchers} from '@testing-library/jest-dom/matchers';
import type {expect} from 'vitest';

declare module 'vitest' {
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends TestingLibraryMatchers<
    ReturnType<typeof expect.stringContaining>,
    R
  > {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<
    ReturnType<typeof expect.stringContaining>,
    unknown
  > {}
}
