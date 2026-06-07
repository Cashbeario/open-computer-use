const fs = require('fs');
const data = JSON.parse(fs.readFileSync('messages/zh.json', 'utf8'));

const items = [
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
  ['connections.emptyState.features.toolsInEveryChat.title', 14, 'wrap_unlimited'],
  ['connections.emptyState.features.toolsInEveryChat.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.features.secureOauth.title', 14, 'wrap_unlimited'],
  ['connections.emptyState.features.secureOauth.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.features.hundredsOfApps.title', 14, 'wrap_unlimited'],
  ['connections.emptyState.features.hundredsOfApps.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.browseAppsCta', 13, 'must_fit'],
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
  ['seo.connections.twitterDescription', 100, 'truncate'],
];

function getByPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
function cc(s) { return typeof s === 'string' ? Array.from(s).length : -1; }

const violations = [];
for (const [k, budget, pol] of items) {
  const v = getByPath(data, k);
  if (v === undefined) continue;
  const n = cc(v);
  if (n > budget) {
    let sev;
    if (pol === 'must_fit') {
      if (n > budget * 1.3) sev = 'blocker';
      else if (n > budget * 1.1) sev = 'major';
      else sev = 'minor';
    } else if (pol === 'truncate') {
      if (n > budget * 1.3) sev = 'major';
      else sev = 'minor';
    } else {
      sev = 'minor';
    }
    violations.push({ key: k, value: v, count: n, budget, pol, sev });
  }
}
console.log(JSON.stringify(violations, null, 2));
