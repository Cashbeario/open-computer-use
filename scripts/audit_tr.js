const fs = require('fs');
const data = JSON.parse(fs.readFileSync('c:/Users/prate/OneDrive/Documents/vscode/open-computer-use/messages/tr.json', 'utf8'));

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const keys = [
  ['connections.title', 40, 'wrap_unlimited'],
  ['connections.connectedSuffix', 14, 'must_fit'],
  ['connections.subtitle', 80, 'wrap_unlimited'],
  ['connections.refresh', 40, 'wrap_unlimited'],
  ['connections.newConnection', 22, 'must_fit'],
  ['connections.toasts.error', 60, 'wrap_unlimited'],
  ['connections.retry', 18, 'must_fit'],
  ['connections.filters.all', 14, 'must_fit'],
  ['connections.filters.active', 14, 'must_fit'],
  ['connections.filters.connecting', 14, 'must_fit'],
  ['connections.filters.expired', 14, 'must_fit'],
  ['connections.filters.failed', 14, 'must_fit'],
  ['connections.noFilteredConnections', 40, 'wrap_unlimited'],
  ['connections.noFilteredDescription', 80, 'wrap_unlimited'],
  ['connections.toasts.connected', 60, 'wrap_unlimited'],
  ['connections.toasts.disconnected', 60, 'wrap_unlimited'],
  ['connections.toasts.disconnectFailed', 60, 'wrap_unlimited'],
  ['connections.fallbackAppName', 20, 'wrap_unlimited'],
  ['pageLoaders.connections.title', 30, 'wrap_unlimited'],
  ['pageLoaders.connections.description', 80, 'wrap_unlimited'],
  ['connections.card.logoAlt', 40, 'wrap_unlimited'],
  ['connections.status.active', 12, 'must_fit'],
  ['connections.status.initiated', 12, 'must_fit'],
  ['connections.status.expired', 12, 'must_fit'],
  ['connections.status.failed', 12, 'must_fit'],
  ['connections.status.inactive', 12, 'must_fit'],
  ['connections.status.failedShort', 10, 'must_fit'],
  ['connections.card.fallbackAccountLabel', 24, 'truncate'],
  ['connections.card.actions.reconnect', 12, 'must_fit'],
  ['connections.card.actions.disconnect', 22, 'wrap_unlimited'],
  ['connections.card.actions.menuAriaLabel', 40, 'wrap_unlimited'],
  ['connections.card.toast.reconnectFailed', 60, 'wrap_unlimited'],
  ['connections.card.toast.disconnected', 60, 'wrap_unlimited'],
  ['connections.card.toast.disconnectFailed', 60, 'wrap_unlimited'],
  ['connections.card.connectedOn', 28, 'wrap_unlimited'],
  ['connections.card.lastUsed', 28, 'wrap_unlimited'],
  ['connections.card.error.expired', 80, 'wrap_unlimited'],
  ['connections.card.error.revoked', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.title', 40, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.connectedOn', 40, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.consequence.revokeOauth', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.consequence.toolsStop', 80, 'wrap_unlimited'],
  ['connections.card.disconnectDialog.confirm', 20, 'must_fit'],
  ['connections.card.disconnectDialog.cancel', 20, 'must_fit'],
  ['connections.emptyState.headline', 40, 'wrap_unlimited'],
  ['connections.emptyState.subheadline', 120, 'wrap_unlimited'],
  ['connections.emptyState.toolkitLogoAlt', 40, 'wrap_unlimited'],
  ['connections.emptyState.features.toolsInEveryChat.title', 24, 'wrap_unlimited'],
  ['connections.emptyState.features.toolsInEveryChat.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.features.secureOauth.title', 24, 'wrap_unlimited'],
  ['connections.emptyState.features.secureOauth.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.features.hundredsOfApps.title', 24, 'wrap_unlimited'],
  ['connections.emptyState.features.hundredsOfApps.desc', 60, 'wrap_unlimited'],
  ['connections.emptyState.browseAppsCta', 22, 'must_fit'],
  ['connections.connectDialog.title', 30, 'wrap_unlimited'],
  ['connections.connectDialog.description', 80, 'wrap_unlimited'],
  ['connections.connectDialog.searchPlaceholder', 30, 'truncate'],
  ['connections.connectDialog.clearSearchAria', 40, 'wrap_unlimited'],
  ['connections.connectDialog.categories.all', 14, 'must_fit'],
  ['connections.connectDialog.categories.communication', 14, 'must_fit'],
  ['connections.connectDialog.categories.productivity', 14, 'must_fit'],
  ['connections.connectDialog.categories.calendar', 14, 'must_fit'],
  ['connections.connectDialog.categories.developer', 14, 'must_fit'],
  ['connections.connectDialog.categories.crmSales', 14, 'must_fit'],
  ['connections.connectDialog.card.logoAlt', 40, 'wrap_unlimited'],
  ['connections.connectDialog.card.alreadyConnectedTooltip', 60, 'wrap_unlimited'],
  ['connections.connectDialog.card.connectedLabel', 18, 'truncate'],
  ['connections.connectDialog.card.connectFallbackDescription', 40, 'truncate'],
  ['connections.connectDialog.footer.poweredBy', 30, 'wrap_unlimited'],
  ['connections.connectDialog.footer.cancel', 18, 'must_fit'],
  ['connections.connectDialog.empty.noMatchTitle', 40, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noAppsTitle', 30, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noMatchBody', 80, 'wrap_unlimited'],
  ['connections.connectDialog.empty.noAppsBody', 80, 'wrap_unlimited'],
  ['connections.connectDialog.errors.failedToStart', 60, 'wrap_unlimited'],
  ['settings.integrations.heading', 30, 'wrap_unlimited'],
  ['settings.integrations.subheading', 80, 'wrap_unlimited'],
  ['settings.integrations.connectNewApp', 18, 'must_fit'],
  ['settings.integrations.manageOnFullPage', 24, 'must_fit'],
  ['connections.row.disconnect', 12, 'must_fit'],
  ['connections.row.disconnectAriaLabel', 40, 'wrap_unlimited'],
  ['connections.empty.title', 30, 'wrap_unlimited'],
  ['connections.empty.description', 80, 'wrap_unlimited'],
  ['accountDialog.sections.integrations.label', 22, 'truncate'],
  ['accountDialog.sections.integrations.description', 40, 'truncate'],
  ['connections.reauth.expiredMessage', 60, 'wrap_unlimited'],
  ['connections.reauth.reconnectLink', 16, 'must_fit'],
  ['connections.reauth.fallbackAppName', 20, 'wrap_unlimited'],
  ['sidebar.connections', 22, 'truncate'],
  ['seo.connections.title', 60, 'truncate'],
  ['seo.connections.description', 160, 'truncate'],
  ['seo.connections.ogTitle', 60, 'truncate'],
  ['seo.connections.ogDescription', 200, 'truncate'],
  ['seo.connections.twitterDescription', 200, 'truncate']
];

const results = [];
const allRows = [];
for (const [key, budget, policy] of keys) {
  const value = get(data, key);
  const len = value == null ? null : [...String(value)].length;
  const ratio = len == null ? null : (len / budget);
  let severity = null;
  if (value == null) {
    severity = 'MISSING';
  } else if (len > budget) {
    if (policy === 'must_fit') {
      if (len > budget * 1.3) severity = 'blocker';
      else severity = 'major';
    } else if (policy === 'truncate') {
      severity = 'major';
    } else if (policy === 'wrap_2lines') {
      if (len > budget * 1.5) severity = 'major';
      else severity = 'minor';
    } else {
      // wrap_unlimited - never violates
      severity = null;
    }
  }
  allRows.push({ key, value, len, budget, policy, ratio: ratio ? ratio.toFixed(2) : null, severity });
  if (severity) {
    results.push({ key, value, len, budget, policy, ratio: ratio == null ? null : ratio.toFixed(2), severity });
  }
}
console.log('VIOLATIONS:');
console.log(JSON.stringify(results, null, 2));
console.log('\nALL ROWS (for context):');
for (const r of allRows) {
  console.log(`${r.severity || 'ok  '}\t${r.len}/${r.budget}\t${r.policy}\t${r.key}\t${JSON.stringify(r.value)}`);
}
