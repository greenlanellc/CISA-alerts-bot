// ============================================================
// Telegram Notifier — Bot API with HTML formatting
// ============================================================

import axios from 'axios';
import type pino from 'pino';
import type { AlertResult, EnrichedAdvisory } from './types';
import { formatTelegramMessage } from './alertFormatter';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Send an enriched advisory alert to Telegram.
 * Handles message splitting for long content.
 */
export async function sendTelegramAlert(
  advisory: EnrichedAdvisory,
  botToken: string,
  chatId: string,
  logger: pino.Logger,
): Promise<AlertResult> {
  const messages = formatTelegramMessage(advisory);
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  for (const [idx, messageText] of messages.entries()) {
    const success = await sendSingleMessage(url, chatId, messageText, idx, messages.length, advisory.url, logger);

    if (!success) {
      return {
        channel: 'telegram',
        success: false,
        error: `Failed to send Telegram message part ${idx + 1}/${messages.length}`,
      };
    }
  }

  logger.info(
    { url: advisory.url, title: advisory.title, parts: messages.length },
    'Telegram alert sent successfully',
  );

  return { channel: 'telegram', success: true };
}

async function sendSingleMessage(
  apiUrl: string,
  chatId: string,
  text: string,
  partIdx: number,
  totalParts: number,
  advisoryUrl: string,
  logger: pino.Logger,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.debug(
        { advisoryUrl, attempt, part: `${partIdx + 1}/${totalParts}` },
        'Sending Telegram message',
      );

      await axios.post(
        apiUrl,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        },
        { timeout: 10_000 },
      );

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { attempt, error: message, advisoryUrl, part: `${partIdx + 1}/${totalParts}` },
        'Telegram message attempt failed',
      );

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  logger.error(
    { advisoryUrl, part: `${partIdx + 1}/${totalParts}` },
    `Failed to send Telegram message after ${MAX_RETRIES} attempts`,
  );
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
