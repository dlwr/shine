export function simpleHash(input: string): number {
  let hash = 2_166_136_261; // FNV offset basis
  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) || 0;
    hash ^= char;
    hash = Math.imul(hash, 16_777_619); // FNV prime
  }

  // Murmurhash3 finalizer: spread bits more evenly
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2_246_822_507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3_266_489_909);
  hash ^= hash >>> 16;

  return hash >>> 0;
}
