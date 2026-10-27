import {beforeEach, describe, expect, it} from 'vitest';
import {markOwnerDevice, webAnalyticsLoader} from './web-analytics';

const beaconSelector = 'script[src*="cloudflareinsights.com/beacon.min.js"]';

function runLoader(token: string): void {
  new Function(webAnalyticsLoader(token))();
}

describe('webAnalyticsLoader', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const script of document.querySelectorAll(beaconSelector)) {
      script.remove();
    }
  });

  it('beacon をトークン付きで読み込む', () => {
    runLoader('token-abc');

    const script = document.querySelector<HTMLScriptElement>(beaconSelector);
    expect(script?.dataset.cfBeacon).toBe(JSON.stringify({token: 'token-abc'}));
  });

  it('本人の端末では beacon を読み込まない', () => {
    markOwnerDevice();

    runLoader('token-abc');

    expect(document.querySelector(beaconSelector)).toBeNull();
  });

  it('印を付ける前にログインした本人の端末でも読み込まない', () => {
    localStorage.setItem('adminToken', 'token-abc');

    runLoader('token-abc');

    expect(document.querySelector(beaconSelector)).toBeNull();
  });
});
