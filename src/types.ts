// ============================================================
// CISA Advisory Monitor — Shared Types
// ============================================================

/** Severity levels derived from advisory content */
export type Severity = 'CRITICAL' | 'HIGH' | 'INFO';

/** Raw advisory entry scraped from the CISA listing page */
export interface AdvisoryListItem {
  /** Advisory title */
  title: string;
  /** Full URL to the advisory page */
  url: string;
  /** Published date as ISO string or raw text */
  publishedDate: string;
  /** Advisory ID (e.g. ICSA-26-043-01) if extractable */
  advisoryId: string | null;
}

/** Enriched advisory after parsing the inner page */
export interface EnrichedAdvisory extends AdvisoryListItem {
  /** Executive summary paragraph(s) */
  executiveSummary: string;
  /** Affected products / vendors */
  affectedProducts: string[];
  /** CVE identifiers found on the page */
  cves: string[];
  /** Mitigation recommendations */
  mitigation: string;
  /** Whether the advisory indicates known active exploitation */
  knownExploitation: boolean;
  /** Derived severity level */
  severity: Severity;
}

/** Persisted state for deduplication */
export interface StateFile {
  /** Array of advisory URLs that have been successfully alerted */
  processed: string[];
  /** ISO timestamp of the last run */
  lastRun: string | null;
}

/** Result of sending an alert */
export interface AlertResult {
  channel: 'slack' | 'telegram';
  success: boolean;
  error?: string;
}

/** Application configuration (validated) */
export interface AppConfig {
  slackWebhookUrl: string | null;
  slackEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramEnabled: boolean;
  scanLimit: number;
  logLevel: string;
}
