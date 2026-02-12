// ============================================================
// Slack Notifier — Webhook with Block Kit
// ============================================================

import axios from 'axios';
import type pino from 'pino';
import type { AlertResult, EnrichedAdvisory } from './types';
import { formatSlackMessage } from './alertFormatter';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/**
 * Send an enriched advisory alert to Slack via incoming webhook.
 */
export async function sendSlackAlert(
  advisory: EnrichedAdvisory,
  webhookUrl: string,
  logger: pino.Logger,
): Promise<AlertResult> {
  const payload = formatSlackMessage(advisory);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(
        { url: advisory.url, attempt },
        'Sending Slack alert',
      );

      await axios.post(webhookUrl, payload, {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json' },
      });

      logger.info(
        { url: advisory.url, title: advisory.title },
        'Slack alert sent successfully',
      );

      return { channel: 'slack', success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { attempt, error: message, url: advisory.url },
        'Slack alert attempt failed',
      );

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  const errorMsg = `Failed to send Slack alert after ${MAX_RETRIES} attempts`;
  logger.error({ url: advisory.url }, errorMsg);
  return { channel: 'slack', success: false, error: errorMsg };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
