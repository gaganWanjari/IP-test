/**
 * Trinity Dashboard Data Transformations
 * Pure functions for parsing, aggregating, and transforming GitHub issue data
 * into the structures consumed by KPI cards, charts, and filters.
 */

/* ── Parse structured issue body ── */
function parseIssueBody(body) {
  if (!body) return {};
  const result = {};

  const fieldMap = {
    'asset name': 'assetName',
    'asset category': 'assetCategory',
    'asset type': 'assetType',
    'asset visibility': 'assetVisibility',
    'asset description': 'description',
    'description': 'description',
    'purpose and value': 'purposeValue',
    'similar existing assets': 'similarAssets',
    'prerequisites': 'prerequisites',
    'asset source': 'assetSource',
    'contributor github username': 'contributor',
  };

  const lines = body.split('\n');
  let currentField = null;
  let currentValue = [];

  for (const line of lines) {
    const headingMatch = line.match(/^###\s+(.+)/);
    if (headingMatch) {
      if (currentField) {
        result[currentField] = currentValue.join('\n').trim();
      }
      const heading = headingMatch[1].trim().toLowerCase();
      currentField = fieldMap[heading] || null;
      currentValue = [];
    } else if (currentField) {
      currentValue.push(line);
    }
  }
  if (currentField) {
    result[currentField] = currentValue.join('\n').trim();
  }

  return result;
}

/* ── Extract checkbox selections ── */
function extractChecked(text) {
  if (!text) return [];
  const checked = [];
  const re = /- \[x\]\s*(.+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    checked.push(m[1].trim());
  }
  if (checked.length === 0 && text.trim() && text.trim() !== '_No response_') {
    return text.split(',').map(s => s.trim()).filter(Boolean);
  }
  return checked;
}

/* ── Build parsed issue array ── */
function buildParsedIssues(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.filter(Boolean).map(issue => {
    const parsed = parseIssueBody(issue.body);
    let categories = extractChecked(parsed.assetCategory);
    const types = extractChecked(parsed.assetType);
    let contributor = (parsed.contributor || '').replace(/^@/, '').trim();
    if (!contributor) contributor = issue.user?.login || 'unknown';

    // Fallback: derive categories from labels if body parsing yields none
    if (categories.length === 0 && Array.isArray(issue.labels)) {
      const skipLabels = ['external-contrib', 'new-contribution'];
      categories = issue.labels
        .map(l => (l && l.name) || '')
        .filter(n => n && !skipLabels.includes(n))
        .map(n => n.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }

    return {
      number: issue.number || 0,
      title: issue.title || '',
      state: issue.state || 'open',
      url: issue.html_url || '',
      created: issue.created_at || null,
      updated: issue.updated_at || null,
      closed: issue.closed_at || null,
      assetName: parsed.assetName || (issue.title || '').replace(/^\[Contribution\]\s*/i, ''),
      categories,
      types,
      contributor,
      visibility: parsed.assetVisibility || '',
      description: parsed.description || '',
      labels: Array.isArray(issue.labels) ? issue.labels.map(l => (l && l.name) || '').filter(Boolean) : [],
    };
  });
}

/* ── Count helper ── */
function countBy(items, keyFn) {
  if (!Array.isArray(items)) return {};
  const counts = {};
  for (const item of items) {
    const keys = keyFn(item);
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const k of arr) {
      if (!k) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  return counts;
}

/* ── Compute KPI values (pure — no DOM) ── */
function computeKPIs(issues) {
  if (!Array.isArray(issues)) return { total: 0, open: 0, closed: 0, contributors: 0, categories: 0 };
  const open = issues.filter(i => i.state === 'open').length;
  const closed = issues.filter(i => i.state === 'closed').length;
  const contributors = new Set(issues.map(i => i.contributor).filter(Boolean)).size;
  const categories = new Set(issues.flatMap(i => Array.isArray(i.categories) ? i.categories : [])).size;
  return { total: issues.length, open, closed, contributors, categories };
}

/* ── Monthly trend aggregation ── */
function aggregateMonthlyTrend(issues) {
  if (!Array.isArray(issues)) return { labels: [], data: [] };
  const monthly = {};
  for (const issue of issues) {
    if (!issue.created) continue;
    const d = new Date(issue.created);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = (monthly[key] || 0) + 1;
  }
  const sortedKeys = Object.keys(monthly).sort();
  return { labels: sortedKeys, data: sortedKeys.map(k => monthly[k]) };
}

// Export for testing (CommonJS / Node.js) or make available globally (browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseIssueBody,
    extractChecked,
    buildParsedIssues,
    countBy,
    computeKPIs,
    aggregateMonthlyTrend,
  };
}
