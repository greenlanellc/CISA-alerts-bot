// ============================================================
// Alert Formatter — Slack Block Kit + Telegram HTML
// ============================================================

import type { EnrichedAdvisory, Severity } from './types';

// ── Severity Icons & Colors ─────────────────────────────────

const SEVERITY_CONFIG: Record<Severity, { icon: string; color: string; label: string }> = {
  CRITICAL: { icon: '🔴', color: '#dc2626', label: 'CRITICAL' },
  HIGH: { icon: '🟠', color: '#f59e0b', label: 'HIGH' },
  INFO: { icon: '🔵', color: '#3b82f6', label: 'INFO' },
};

const ICONS = {
  shield: '🛡️',
  warning: '⚠️',
  bug: '🐛',
  link: '🔗',
  calendar: '📅',
  package: '📦',
  fire: '🔥',
  memo: '📝',
  wrench: '🔧',
  siren: '🚨',
  checkmark: '✅',
  document: '📄',
};

// ══════════════════════════════════════════════════════════════
// SLACK — Block Kit Payload
// ══════════════════════════════════════════════════════════════

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string }>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: { type: string; text: { type: string; text: string; emoji: boolean }; url: string };
}

export function formatSlackMessage(advisory: EnrichedAdvisory): { blocks: SlackBlock[] } {
  const sev = SEVERITY_CONFIG[advisory.severity];

  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${sev.icon} CISA Alert: ${advisory.title}`,
      emoji: true,
    },
  });

  // Severity + Date bar
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*${ICONS.shield} Severity:*\n${sev.icon} ${sev.label}`,
      },
      {
        type: 'mrkdwn',
        text: `*${ICONS.calendar} Published:*\n${advisory.publishedDate || 'N/A'}`,
      },
    ],
  });

  // Advisory ID (if present)
  if (advisory.advisoryId) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ICONS.document} Advisory ID:* \`${advisory.advisoryId}\``,
      },
    });
  }

  // Exploitation warning
  if (advisory.knownExploitation) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${ICONS.fire} *KNOWN ACTIVE EXPLOITATION* — Immediate action recommended`,
      },
    });
  }

  // CVEs
  if (advisory.cves.length > 0) {
    const cveList = advisory.cves
      .slice(0, 15)
      .map((cve) => `\`${cve}\``)
      .join('  ');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ICONS.bug} CVEs (${advisory.cves.length}):*\n${cveList}`,
      },
    });
  }

  // Executive summary
  if (advisory.executiveSummary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ICONS.memo} Summary:*\n${truncateSlack(advisory.executiveSummary, 500)}`,
      },
    });
  }

  // Affected products
  if (advisory.affectedProducts.length > 0) {
    const productList = advisory.affectedProducts
      .slice(0, 8)
      .map((p) => `• ${p}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ICONS.package} Affected Products:*\n${productList}`,
      },
    });
  }

  // Mitigation
  if (advisory.mitigation) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${ICONS.wrench} Mitigation:*\n${truncateSlack(advisory.mitigation, 400)}`,
      },
    });
  }

  // Link button
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `${ICONS.link} *<${advisory.url}|Read Full Advisory>*`,
    },
  });

  // Divider
  blocks.push({ type: 'divider' });

  // Footer
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${ICONS.shield} CISA Advisory Monitor • Automated alert`,
      },
    ],
  });

  return { blocks };
}

// ══════════════════════════════════════════════════════════════
// TELEGRAM — HTML formatted message
// ══════════════════════════════════════════════════════════════

export function formatTelegramMessage(advisory: EnrichedAdvisory): string[] {
  const sev = SEVERITY_CONFIG[advisory.severity];

  const parts: string[] = [];

  // Title bar
  parts.push(`${sev.icon} <b>CISA Alert</b>: ${escapeHtml(advisory.title)}`);
  parts.push('');

  // Severity + exploitation warning
  parts.push(`${ICONS.shield} <b>Severity:</b> ${sev.icon} <code>${sev.label}</code>`);

  if (advisory.knownExploitation) {
    parts.push(`${ICONS.fire} <b>⚠️ KNOWN ACTIVE EXPLOITATION</b>`);
  }

  parts.push(`${ICONS.calendar} <b>Published:</b> ${escapeHtml(advisory.publishedDate || 'N/A')}`);

  if (advisory.advisoryId) {
    parts.push(`${ICONS.document} <b>Advisory ID:</b> <code>${escapeHtml(advisory.advisoryId)}</code>`);
  }

  parts.push('');

  // CVEs
  if (advisory.cves.length > 0) {
    parts.push(`${ICONS.bug} <b>CVEs (${advisory.cves.length}):</b>`);
    const cveList = advisory.cves
      .slice(0, 15)
      .map((cve) => `  <code>${escapeHtml(cve)}</code>`)
      .join('\n');
    parts.push(cveList);
    parts.push('');
  }

  // Summary
  if (advisory.executiveSummary) {
    parts.push(`${ICONS.memo} <b>Summary:</b>`);
    parts.push(escapeHtml(truncate(advisory.executiveSummary, 600)));
    parts.push('');
  }

  // Affected products
  if (advisory.affectedProducts.length > 0) {
    parts.push(`${ICONS.package} <b>Affected Products:</b>`);
    for (const product of advisory.affectedProducts.slice(0, 8)) {
      parts.push(`  • ${escapeHtml(product)}`);
    }
    parts.push('');
  }

  // Mitigation
  if (advisory.mitigation) {
    parts.push(`${ICONS.wrench} <b>Mitigation:</b>`);
    parts.push(escapeHtml(truncate(advisory.mitigation, 400)));
    parts.push('');
  }

  // Link
  parts.push(`${ICONS.link} <a href="${advisory.url}">Read Full Advisory</a>`);
  parts.push('');
  parts.push(`<i>${ICONS.shield} CISA Advisory Monitor • Automated alert</i>`);

  const fullMessage = parts.join('\n');

  // Split if message exceeds Telegram's 4096 char limit
  return splitTelegramMessage(fullMessage);
}

// ── Helpers ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function truncateSlack(text: string, maxLen: number): string {
  // Slack has per-field limits of ~3000 chars; we keep it shorter for readability
  return truncate(text, maxLen);
}

function splitTelegramMessage(message: string): string[] {
  const MAX_LEN = 4096;
  if (message.length <= MAX_LEN) return [message];

  const messages: string[] = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      messages.push(remaining);
      break;
    }

    // Find a good split point (newline near the limit)
    let splitIdx = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitIdx < MAX_LEN * 0.5) {
      // No good newline found — split at limit
      splitIdx = MAX_LEN;
    }

    messages.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return messages;
}
