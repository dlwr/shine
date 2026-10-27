const OWNER_DEVICE_KEY = 'shine-owner-device';
const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';

export function markOwnerDevice(): void {
  globalThis.localStorage?.setItem(OWNER_DEVICE_KEY, '1');
}

export function webAnalyticsLoader(token: string): string {
  const beacon = JSON.stringify(JSON.stringify({token}));
  return `(function(){try{if(localStorage.getItem('${OWNER_DEVICE_KEY}')||localStorage.getItem('adminToken'))return;}catch(e){}var s=document.createElement('script');s.defer=true;s.src='${BEACON_URL}';s.setAttribute('data-cf-beacon',${beacon});document.body.appendChild(s);})();`;
}
