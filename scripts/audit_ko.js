const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'messages', 'ko.json'), 'utf8'));

function get(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const keys = [
  ['connections.title', 40, 'wrap_unlimited'],
  ['connections.connectedSuffix', 8, 'must_fit'],
  ['connections.subtitle', 80, 'wrap_unlimited'],
  ['connections.refresh', 40, 'wrap_unlimited'],
  ['connections.newConnection', 12, 'must_fit'],
  ['connections.toasts.error', 40, 'wrap_unlimited'],
  ['connections.retry', 10, 'must_fit'],
  ['connections.filters.all', 8, 'must_fit'],
  ['connections.filters.active', 8, 'must_fit'],
  ['connections.filters.connecting', 8, 'must_fit'],
  ['connections.filters.expired', 8, 'must_fit'],
  ['connections.filters.failed', 8, 'must_fit'],
  ['connections.noFilteredConnections', 40, 'wrap_unlimited'],
  ['connections.noFilteredDescription', 80, 'wrap_unlimited'],
  ['connections.toasts.connected', 40, 'wrap_unlimited'],
  ['connections.toasts.disconnected', 40, 'wrap_unlimited'],
  ['connections.toasts.disconnectFailed', 40, 'wrap_unlimited'],
  ['connections.fallbackAppName', 12, 'wrap_unlimited'],
  ['pageLoaders.connections.title', 18, 'wrap_unlimited'],
  ['pageLoaders.connections.description', 80, 'wrap_unlimited'],
  ['connections.card.logoAlt', 40, 'wrap_unlimited'],
  ['connections.status.active', 7, 'must_fit'],
  ['connections.status.initiated', 7, 'must_fit'],
  ['connections.status.expired', 7, 'must_fit'],
  ['connections.status.failed', 7, 'must_fit'],
  ['connections.status.inactive', 7, 'must_fit'],
  ['connections.status.failedShort', 6, 'must_fit'],
  ['connections.card.fallbackAccountLabel', 14, 'truncate'],
  ['connections.card.actions.reconnect', 7, 'must_fit'],
  ['connections.card.actions.disconnect', 13, 'wrap_unlimited'],
  ['connections.card.actions.menuAriaLabel', 40, 'wrap_unlimited'],
  ['connections.toasts.reconnectFailed', 40, 'wrap_unlimited'],
  ['connections.toasts.disconnected', 40, 'wrap_unlimited'],
  ['connections.toasts.disconnectFailed', 40, 'wrap_unlimited'],
  ['connections.card.connectedOn', 18, 'wrap_unlimited'],
  ['connections.card.lastUsed', 18, 'wrap_unlimited'],
  ['connections.card.error.expired', 80, 'wrap_unlimited'],
  ['connections.card.error.revoked', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.title', 25, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.connectedOn', 25, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.consequence.revokeOauth', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.consequence.toolsStop', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.confirm', 12, 'must_fit'],
  ['connections.card.disconnectDialog.cancel', 12, 'must_fit'],
  ['connections.emptyState.headline', 25, 'wrap_unlimited'],
  ['connections.emptyState.subheadline', 120, 'wrap_unlimited'],
  ['connections.emptyState.toolkitLogoAlt', 40, 'wrap_unlimited'],
  ['connections.features.toolsInEveryChat.title', 14, 'wrap_unlimited'],
  ['connections.features.toolsInEveryChat.desc', 60, 'wrap_unlimited'],
  ['connections.features.secureOauth.title', 14, 'wrap_unlimited'],
  ['connections.features.secureOauth.desc', 60, 'wrap_unlimited'],
  ['connections.features.hundredsOfApps.title', 14, 'wrap_unlimited'],
  ['connections.features.hundredsOfApps.desc', 60, 'wrap_unlimited'],
  ['connections.browseAppsCta', 13, 'must_fit'],
  ['connections.connectDialog.title', 18, 'wrap_unlimited'],
  ['connections.connectDialog.description', 80, 'wrap_unlimited'],
  ['connections.connectDialog.searchPlaceholder', 18, 'truncate'],
  ['connections.connectDialog.clearSearchAria', 40, 'wrap_unlimited'],
  ['connections.connectDialog.categories.all', 8, 'must_fit'],
  ['connections.connectDialog.categories.communication', 8, 'must_fit'],
  ['connections.connectDialog.categories.productivity', 8, 'must_fit'],
  ['connections.connectDialog.categories.calendar', 8, 'must_fit'],
  ['connections.connectDialog.categories.developer', 8, 'must_fit'],
  ['connections.connectDialog.categories.crmSales', 8, 'must_fit'],
  ['connections.connectDialog.card.logoAlt', 40, 'wrap_unlimited'],
  ['connections.connectDialog.card.alreadyConnectedTooltip', 40, 'wrap_unlimited'],
  ['connections.connectDialog.card.connectedLabel', 11, 'truncate'],
  ['connections.connectDialog.card.connectFallbackDescription', 25, 'truncate'],
  ['connections.connectDialog.footer.poweredBy', 18, 'wrap_unlimited'],
  ['connections.connectDialog.footer.cancel', 11, 'must_fit'],
  ['connections.connectDialog.empty.noMatchTitle', 25, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noAppsTitle', 18, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noMatchBody', 80, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noAppsBody', 80, 'wrap_unlimited'],
  ['connections.connectDialog.errors.failedToStart', 40, 'wrap_unlimited'],
  ['settings.integrations.heading', 18, 'wrap_unlimited'],
  ['settings.integrations.subheading', 80, 'wrap_unlimited'],
  ['settings.integrations.connectNewApp', 11, 'must_fit'],
  ['settings.integrations.manageOnFullPage', 14, 'must_fit'],
  ['connections.row.disconnect', 7, 'must_fit'],
  ['connections.row.disconnectAriaLabel', 40, 'wrap_unlimited'],
  ['connections.empty.title', 18, 'wrap_unlimited'],
  ['connections.empty.description', 80, 'wrap_unlimited'],
  ['accountDialog.sections.integrations.label', 13, 'truncate'],
  ['accountDialog.sections.integrations.description', 25, 'truncate'],
  ['connections.reauth.expiredMessage', 40, 'wrap_unlimited'],
  ['connections.reauth.reconnectLink', 10, 'must_fit'],
  ['connections.reauth.fallbackAppName', 12, 'wrap_unlimited'],
  ['sidebar.connections', 13, 'truncate'],
  ['seo.connections.title', 30, 'truncate'],
  ['seo.connections.description', 80, 'truncate'],
  ['seo.connections.ogTitle', 30, 'truncate'],
  ['seo.connections.ogDescription', 100, 'truncate'],
  ['seo.connections.twitterDescription', 100, 'truncate']
];

const out = [];
for (const [key, budget, policy] of keys) {
  const val = get(data, key);
  if (val === undefined) {
    out.push({ key, value: null, char_count: null, budget, policy, status: 'MISSING' });
    continue;
  }
  const cleaned = String(val).replace(/\{[^}]+\}/g, 'X');
  const len = [...cleaned].length;
  let status = 'ok';
  const ratio = len / budget;
  if (policy === 'must_fit') {
    if (ratio > 1.3) status = 'blocker';
    else if (len > budget) status = 'major';
  } else if (policy === 'truncate') {
    if (ratio > 1.3) status = 'blocker';
    else if (len > budget) status = 'major';
  } else if (policy === 'wrap_2lines') {
    if (ratio > 1.5) status = 'blocker';
    else if (len > budget) status = 'minor';
  } else if (policy === 'wrap_unlimited') {
    if (len > budget * 1.5) status = 'minor';
  }
  out.push({ key, value: val, char_count: len, budget, policy, status, ratio: ratio.toFixed(2) });
}

for (const r of out) {
  if (r.status !== 'ok') {
    console.log(JSON.stringify(r));
  }
}
console.log('---');
console.log('TOTAL:', out.length, 'VIOLATIONS:', out.filter(r => r.status !== 'ok').length);
