/**
 * OG画像生成用のアセット取得。
 * フォントはGoogle Fontsのtext=サブセットを使い、日本語でも数KBに抑える。
 * (UAを名乗らずに取得するとtruetype形式のURLが返る。Satoriはwoff2を読めない)
 */

export function buildFontCssUrl(
  family: string,
  weight: number,
  text: string,
): string {
  const uniqueText = [...new Set(text)].join('');
  const familyParameter = `${family.replaceAll(' ', '+')}:wght@${weight}`;

  return `https://fonts.googleapis.com/css2?family=${familyParameter}&text=${encodeURIComponent(uniqueText)}`;
}

export function extractFontUrl(css: string): string | undefined {
  return /src:\s*url\((?<url>[^)]+)\)\s*format\(['"](?:truetype|opentype)['"]\)/.exec(
    css,
  )?.groups?.url;
}

export function arrayBufferToDataUri(
  buffer: ArrayBuffer,
  mimeType: string,
): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | undefined> {
  try {
    const cssResponse = await fetch(buildFontCssUrl(family, weight, text));
    if (!cssResponse.ok) {
      return undefined;
    }

    const fontUrl = extractFontUrl(await cssResponse.text());
    if (!fontUrl) {
      return undefined;
    }

    const fontResponse = await fetch(fontUrl);
    return fontResponse.ok ? fontResponse.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPosterAsDataUri(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url) {
    return undefined;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }

    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    return arrayBufferToDataUri(await response.arrayBuffer(), mimeType);
  } catch {
    return undefined;
  }
}
