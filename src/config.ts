// ============================================================
// Configuration — Zod-validated environment variables
// ============================================================

import { z } from 'zod';
import type { AppConfig } from './types';

const boolString = z
  .string()
  .default('false')
  .transform((v) => v.toLowerCase() === 'true');

const optionalUrl = z
  .string()
  .default('')
  .refine((v) => v === '' || /^https?:\/\/.+/.test(v), 'Must be a valid URL or empty');

const configSchema = z.object({
  SLACK_WEBHOOK_URL: optionalUrl,
  SLACK_ENABLED: boolString.default('true'),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),
  TELEGRAM_ENABLED: boolString.default('true'),

  SCAN_LIMIT: z
    .string()
    .default('10')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v > 0 && v <= 50, 'SCAN_LIMIT must be between 1 and 50'),

  LOG_LEVEL: z
    .string()
    .default('info')
    .refine(
      (v) => ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(v),
      'Invalid LOG_LEVEL',
    ),
});

export function loadConfig(): AppConfig {
  const parsed = configSchema.parse(process.env);

  // Automatically disable channels if secrets are not provided
  const slackEnabled = parsed.SLACK_ENABLED && parsed.SLACK_WEBHOOK_URL.length > 0;
  const telegramEnabled =
    parsed.TELEGRAM_ENABLED &&
    parsed.TELEGRAM_BOT_TOKEN.length > 0 &&
    parsed.TELEGRAM_CHAT_ID.length > 0;

  return {
    slackWebhookUrl: parsed.SLACK_WEBHOOK_URL || null,
    slackEnabled,
    telegramBotToken: parsed.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: parsed.TELEGRAM_CHAT_ID || null,
    telegramEnabled,
    scanLimit: parsed.SCAN_LIMIT,
    logLevel: parsed.LOG_LEVEL,
  };
}
