// ============================================================
// CISA Advisory Monitor — Main Orchestrator
// ============================================================

import 'dotenv/config';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { StateManager } from './stateManager';
import { scrapeAdvisoryList } from './cisaScraper';
import { enrichAdvisories } from './advisoryParser';
import { sendSlackAlert } from './slack';
import { sendTelegramAlert } from './telegram';
import type { EnrichedAdvisory, AlertResult } from './types';
import type pino from 'pino';
import type { AppConfig } from './types';

async function main(): Promise<void> {
  // ── 1. Load configuration ──────────────────────────────────
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info({ event: 'scan_started' }, 'CISA Advisory Monitor starting');

  // ── 2. Load state ──────────────────────────────────────────
  const state = await StateManager.load(logger);

  // ── 3. Scrape advisory listing ─────────────────────────────
  const advisories = await scrapeAdvisoryList(config.scanLimit, logger);

  logger.info(
    { event: 'advisories_found', count: advisories.length },
    `Found ${advisories.length} advisories on listing page`,
  );

  if (advisories.length === 0) {
    logger.info('No advisories found — exiting');
    await state.save();
    return;
  }

  // ── 4. Filter out already-processed ────────────────────────
  const newAdvisories = advisories.filter((a) => !state.isProcessed(a.url));

  logger.info(
    { event: 'new_advisories_count', count: newAdvisories.length },
    `${newAdvisories.length} new advisory(ies) to process`,
  );

  if (newAdvisories.length === 0) {
    logger.info('All advisories already processed — exiting');
    await state.save();
    return;
  }

  // ── 5. Enrich new advisories ───────────────────────────────
  const enriched = await enrichAdvisories(newAdvisories, logger);

  // ── 6. Send alerts ─────────────────────────────────────────
  let successCount = 0;
  let failCount = 0;

  for (const advisory of enriched) {
    const results = await sendAlerts(advisory, config, logger);

    // Advisory is marked as processed only if at least one channel succeeded
    const anySuccess = results.some((r) => r.success);

    if (anySuccess) {
      state.markProcessed(advisory.url);
      successCount++;

      logger.info(
        {
          event: 'advisory_processed',
          url: advisory.url,
          title: advisory.title,
          severity: advisory.severity,
          cves: advisory.cves.length,
        },
        'Advisory processed and alerted',
      );
    } else {
      failCount++;
      logger.error(
        { url: advisory.url, title: advisory.title },
        'All alert channels failed — advisory NOT marked as processed',
      );
    }
  }

  // ── 7. Save state ──────────────────────────────────────────
  await state.save();

  // ── 8. Summary ─────────────────────────────────────────────
  logger.info(
    {
      event: 'scan_completed',
      totalFound: advisories.length,
      newFound: newAdvisories.length,
      enriched: enriched.length,
      alerted: successCount,
      failed: failCount,
    },
    `Scan complete: ${successCount} alerted, ${failCount} failed`,
  );
}

/**
 * Send alerts to all enabled channels for a single advisory.
 * Continues even if one channel fails.
 */
async function sendAlerts(
  advisory: EnrichedAdvisory,
  config: AppConfig,
  logger: pino.Logger,
): Promise<AlertResult[]> {
  const results: AlertResult[] = [];

  if (config.slackEnabled && config.slackWebhookUrl) {
    const result = await sendSlackAlert(advisory, config.slackWebhookUrl, logger);
    results.push(result);

    if (result.success) {
      logger.info({ event: 'alert_sent', channel: 'slack', url: advisory.url }, 'Slack alert delivered');
    }
  }

  if (config.telegramEnabled && config.telegramBotToken && config.telegramChatId) {
    const result = await sendTelegramAlert(
      advisory,
      config.telegramBotToken,
      config.telegramChatId,
      logger,
    );
    results.push(result);

    if (result.success) {
      logger.info({ event: 'alert_sent', channel: 'telegram', url: advisory.url }, 'Telegram alert delivered');
    }
  }

  // If no channels are enabled, log a warning but still mark as "success"
  if (results.length === 0) {
    logger.warn(
      { url: advisory.url },
      'No alert channels enabled — advisory will be marked as processed',
    );
    results.push({ channel: 'slack', success: true });
  }

  return results;
}

// ── Entry Point ──────────────────────────────────────────────

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error in CISA Advisory Monitor:', err);
  // Exit 0 to avoid permanently failing the GitHub Action
  // The error is logged — operators can inspect logs
  process.exit(0);
});
