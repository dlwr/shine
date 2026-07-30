const IMDB_ID_PATTERN = /^tt\d{7,}$/;

/**
 * IMDb ID として妥当な文字列かを判定する。
 *
 * movies.imdb_id は NULL を許容しており、値が無いまま Wikipedia 検索へ渡すと
 * `?search=null` で「Null」という無関係な記事にヒットし、それを邦題として
 * 保存してしまう事故が起きた。検索前に必ずこの関数で弾くこと。
 */
export function isValidImdbId(value: unknown): value is string {
  return typeof value === 'string' && IMDB_ID_PATTERN.test(value);
}
