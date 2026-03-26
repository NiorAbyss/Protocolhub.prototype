// client/src/lib/useAnalytics.ts
// Fires a panel/feature view event to the backend analytics table.
// Called once per panel mount and once per tab switch.
// No wallet required — anonymous tracking by panel name only.
// Gate must be off or wallet must be valid for the event to mean anything.

let _lastEvent = '';

export function trackPanel(panel: string) {
  const key = `panel:${panel}`;
  if (_lastEvent === key) return;      // dedupe rapid re-renders
  _lastEvent = key;

  const wallet = (window as any).__walletPublicKey
    || localStorage.getItem('connectedWallet')
    || null;

  fetch('/api/analytics/event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ wallet, event: 'PAGE_VIEW', panel }),
  }).catch(() => {});  // fire and forget — never block the UI
}

export function trackFeature(panel: string, feature: string) {
  const wallet = (window as any).__walletPublicKey
    || localStorage.getItem('connectedWallet')
    || null;

  fetch('/api/analytics/event', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ wallet, event: 'FEATURE_USE', panel, feature }),
  }).catch(() => {});
}