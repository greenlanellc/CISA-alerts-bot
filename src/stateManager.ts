// ============================================================
// State Manager — JSON file-based deduplication
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import type pino from 'pino';
import type { StateFile } from './types';

const STATE_DIR = path.resolve(process.cwd(), 'state');
const STATE_PATH = path.join(STATE_DIR, 'processed-advisories.json');

function emptyState(): StateFile {
  return { processed: [], lastRun: null };
}

export class StateManager {
  private state: StateFile;
  private logger: pino.Logger;

  private constructor(state: StateFile, logger: pino.Logger) {
    this.state = state;
    this.logger = logger;
  }

  /** Load state from disk (creates file if missing) */
  static async load(logger: pino.Logger): Promise<StateManager> {
    try {
      const raw = await fs.readFile(STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StateFile;

      // Basic validation
      if (!Array.isArray(parsed.processed)) {
        logger.warn('State file has invalid format, starting fresh');
        return new StateManager(emptyState(), logger);
      }

      logger.info(
        { processedCount: parsed.processed.length, lastRun: parsed.lastRun },
        'State loaded',
      );
      return new StateManager(parsed, logger);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No state file found — creating fresh state');
        return new StateManager(emptyState(), logger);
      }
      logger.error({ err }, 'Error reading state file — starting fresh');
      return new StateManager(emptyState(), logger);
    }
  }

  /** Check whether an advisory URL has already been processed */
  isProcessed(url: string): boolean {
    return this.state.processed.includes(url);
  }

  /** Mark an advisory URL as processed */
  markProcessed(url: string): void {
    if (!this.state.processed.includes(url)) {
      this.state.processed.push(url);
      this.logger.debug({ url }, 'Marked advisory as processed');
    }
  }

  /** Persist state back to disk */
  async save(): Promise<void> {
    this.state.lastRun = new Date().toISOString();

    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');

    this.logger.info(
      { processedCount: this.state.processed.length, lastRun: this.state.lastRun },
      'State saved',
    );
  }

  /** Get current state (for testing / debugging) */
  getState(): Readonly<StateFile> {
    return this.state;
  }
}
