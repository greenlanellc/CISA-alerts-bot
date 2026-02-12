// ============================================================
// CISA Advisory List Scraper
// ============================================================

import axios from 'axios';
import * as cheerio from 'cheerio';
import type pino from 'pino';
import type { AdvisoryListItem } from './types';

const CISA_ADVISORIES_URL =
  'https://www.cisa.gov/news-events/cybersecurity-advisories?f%5B0%5D=advisory_type%3A93';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

/**
 * Fetch and parse the CISA advisory listing page.
 * Returns up to `limit` advisory entries.
 */
export async function scrapeAdvisoryList(
  limit: number,
  logger: pino.Logger,
): Promise<AdvisoryListItem[]> {
  const html = await fetchWithRetry(CISA_ADVISORIES_URL, logger);

  if (!html) {
    logger.error('Failed to fetch CISA advisory listing after retries');
    return [];
  }

  return parseAdvisoryList(html, limit, logger);
}

/**
 * Parse advisory items from the listing page HTML.
 */
function parseAdvisoryList(
  html: string,
  limit: number,
  logger: pino.Logger,
): AdvisoryListItem[] {
  const $ = cheerio.load(html);
  const advisories: AdvisoryListItem[] = [];

  // The CISA listing page renders each advisory as a block containing:
  //   - A date string
  //   - An "Alert" type label
  //   - An <h3> with a link containing the title and URL
  //
  // We target the h3 > a elements inside the main content area.
  // Each advisory block is a sibling group of date, type, and heading.

  // Strategy: find all h3 links in the main content area
  const mainContent = $('main, #main, .c-view, .view-content, .views-row, body');
  const headingLinks = mainContent.find('h3 a[href*="/news-events/alerts/"]');

  headingLinks.each((_i, el) => {
    if (advisories.length >= limit) return; // skip remaining

    const $link = $(el);
    const title = $link.text().trim();
    let href = $link.attr('href') || '';

    // Make absolute URL
    if (href.startsWith('/')) {
      href = `https://www.cisa.gov${href}`;
    }

    if (!title || !href) return; // skip malformed entries

    // Walk backwards from the h3 to find the date text
    // The date is typically a text node preceding the h3's parent block
    const $heading = $link.closest('h3');
    let publishedDate = '';

    // Try to find date in the surrounding container
    const $container = $heading.parent();
    const containerText = $container.text();

    // Extract date pattern like "Feb 10, 2026"
    const dateMatch = containerText.match(
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/,
    );
    if (dateMatch) {
      publishedDate = dateMatch[0];
    }

    // Extract advisory ID from URL (e.g., icsa-26-043-01)
    const idMatch = href.match(/\/((?:icsa|icsma|aa|ics-cert)[a-z-]*-[\d-]+)/i);
    const advisoryId = idMatch ? idMatch[1].toUpperCase() : null;

    advisories.push({
      title,
      url: href,
      publishedDate,
      advisoryId,
    });
  });

  // Sort by published date descending (newest first)
  advisories.sort((a, b) => {
    const dateA = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
    const dateB = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
    return dateB - dateA;
  });

  logger.info({ count: advisories.length }, 'Advisories scraped from listing (sorted newest first)');
  return advisories;
}

/**
 * Fetch a URL with retry + exponential backoff.
 */
export async function fetchWithRetry(
  url: string,
  logger: pino.Logger,
  retries: number = MAX_RETRIES,
): Promise<string | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.debug({ url, attempt }, 'Fetching URL');

      const response = await axios.get<string>(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'User-Agent':
            'CISA-Advisory-Monitor/1.0 (GitHub Action; +https://github.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
        responseType: 'text',
      });

      return response.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ url, attempt, error: message }, 'Fetch attempt failed');

      if (attempt < retries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
