// ============================================================
// Advisory Inner-Page Parser + Enrichment
// ============================================================

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type pino from 'pino';
import { fetchWithRetry } from './cisaScraper';
import type { AdvisoryListItem, EnrichedAdvisory, Severity } from './types';

const CVE_REGEX = /CVE-\d{4}-\d{4,}/g;
const CONCURRENCY_LIMIT = 3;

/**
 * Enrich a batch of advisories by fetching their inner pages.
 * Processes up to CONCURRENCY_LIMIT pages concurrently.
 */
export async function enrichAdvisories(
  advisories: AdvisoryListItem[],
  logger: pino.Logger,
): Promise<EnrichedAdvisory[]> {
  const results: EnrichedAdvisory[] = [];

  // Process in chunks of CONCURRENCY_LIMIT
  for (let i = 0; i < advisories.length; i += CONCURRENCY_LIMIT) {
    const chunk = advisories.slice(i, i + CONCURRENCY_LIMIT);

    const enriched = await Promise.allSettled(
      chunk.map((advisory) => enrichSingle(advisory, logger)),
    );

    for (const result of enriched) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error({ error: result.reason }, 'Failed to enrich advisory');
      }
    }
  }

  return results;
}

/**
 * Fetch and parse a single advisory's inner page.
 */
async function enrichSingle(
  advisory: AdvisoryListItem,
  logger: pino.Logger,
): Promise<EnrichedAdvisory> {
  const html = await fetchWithRetry(advisory.url, logger);

  if (!html) {
    logger.warn({ url: advisory.url }, 'Could not fetch inner page — using minimal data');
    return {
      ...advisory,
      executiveSummary: '',
      affectedProducts: [],
      cves: [],
      mitigation: '',
      knownExploitation: false,
      severity: 'INFO',
    };
  }

  return parseInnerPage(advisory, html, logger);
}

/**
 * Parse the advisory detail page and extract structured data.
 */
function parseInnerPage(
  advisory: AdvisoryListItem,
  html: string,
  logger: pino.Logger,
): EnrichedAdvisory {
  const $ = cheerio.load(html);

  // Get main content area (the body of the advisory)
  const mainContent =
    $('main .c-page__content, main article, main .l-content, main').first();
  const fullText = mainContent.text();

  // --- Extract CVEs ---
  const cveMatches = fullText.match(CVE_REGEX) || [];
  const cves = [...new Set(cveMatches)]; // deduplicate

  // --- Executive summary ---
  // Typically the first substantive paragraph(s) after the title/date
  const executiveSummary = extractSection($, fullText, [
    'executive summary',
    'summary',
    'overview',
  ]) || extractFirstParagraphs($, mainContent);

  // --- Affected products ---
  const affectedProducts = extractAffectedProducts($, fullText);

  // --- Mitigation ---
  const mitigation = extractSection($, fullText, [
    'mitigation',
    'mitigations',
    'recommendation',
    'recommendations',
    'remediation',
    'action',
  ]) || '';

  // --- Exploitation status ---
  const knownExploitation = detectExploitation(fullText);

  // --- Severity ---
  const severity = deriveSeverity(fullText, knownExploitation, cves.length);

  logger.debug(
    {
      url: advisory.url,
      cveCount: cves.length,
      severity,
      knownExploitation,
    },
    'Advisory enriched',
  );

  return {
    ...advisory,
    executiveSummary: truncate(executiveSummary, 800),
    affectedProducts,
    cves,
    mitigation: truncate(mitigation, 600),
    knownExploitation,
    severity,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function extractSection(
  $: cheerio.CheerioAPI,
  fullText: string,
  headings: string[],
): string {
  // Try to find a heading that matches and grab subsequent text
  for (const heading of headings) {
    const regex = new RegExp(
      `(?:^|\\n)\\s*(?:#+\\s*)?${heading}[:\\s]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#+|[A-Z][a-z]+\\s+[A-Z])|$)`,
      'i',
    );
    const match = fullText.match(regex);
    if (match?.[1]) {
      return match[1].trim().slice(0, 1000);
    }
  }

  // Fallback: look for h2/h3 headings in the DOM
  const allHeadings = $('h2, h3');
  for (const heading of headings) {
    const lowerHeading = heading.toLowerCase();
    let foundText = '';

    allHeadings.each((_i, el) => {
      if (foundText) return;
      const headText = $(el).text().toLowerCase().trim();
      if (headText.includes(lowerHeading)) {
        // Gather text from sibling elements until next heading
        let sibling = $(el).next();
        const parts: string[] = [];
        while (sibling.length && !sibling.is('h1, h2, h3')) {
          parts.push(sibling.text().trim());
          sibling = sibling.next();
        }
        foundText = parts.join('\n').trim();
      }
    });

    if (foundText) return foundText;
  }

  return '';
}

function extractFirstParagraphs(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
): string {
  const paragraphs: string[] = [];
  container.find('p').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 40 && paragraphs.length < 3) {
      paragraphs.push(text);
    }
  });
  return paragraphs.join('\n\n');
}

function extractAffectedProducts(
  $: cheerio.CheerioAPI,
  fullText: string,
): string[] {
  const products: string[] = [];

  // Look for an "Affected Products" or "Affected Systems" section
  const productPatterns = [
    /affected\s+(?:products?|systems?|software|platforms?)[:\s]*\n([\s\S]*?)(?=\n\s*(?:#+|[A-Z][a-z]+\s)|$)/i,
  ];

  for (const pattern of productPatterns) {
    const match = fullText.match(pattern);
    if (match?.[1]) {
      const lines = match[1]
        .split('\n')
        .map((l) => l.replace(/^[\s*•\-–]+/, '').trim())
        .filter((l) => l.length > 2 && l.length < 200);
      products.push(...lines.slice(0, 10));
      break;
    }
  }

  // Fallback: look for list items near "affected" text
  if (products.length === 0) {
    $('li').each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 5 && text.length < 200 && products.length < 10) {
        // Check if this list is near an "affected" heading
        const prev = $(el).parent().prev();
        if (prev.text().toLowerCase().includes('affected')) {
          products.push(text);
        }
      }
    });
  }

  return [...new Set(products)];
}

function detectExploitation(text: string): boolean {
  const exploitPatterns = [
    /active(?:ly)?\s+exploit/i,
    /known\s+exploit/i,
    /exploited\s+in\s+the\s+wild/i,
    /evidence\s+of\s+(?:active\s+)?exploitation/i,
    /being\s+exploit/i,
    /under\s+(?:active\s+)?exploitation/i,
  ];
  return exploitPatterns.some((p) => p.test(text));
}

function deriveSeverity(
  text: string,
  knownExploitation: boolean,
  cveCount: number,
): Severity {
  const lowerText = text.toLowerCase();

  // If exploitation is known → always CRITICAL
  if (knownExploitation) return 'CRITICAL';

  // Text-based severity signals
  if (
    /\bcritical\b/i.test(text) ||
    /cvss.*(?:9\.\d|10\.0)/i.test(text) ||
    /\bremote\s+code\s+execution\b/i.test(text)
  ) {
    return 'CRITICAL';
  }

  if (
    /\bhigh\b/i.test(text) ||
    /cvss.*(?:7\.\d|8\.\d)/i.test(text) ||
    cveCount >= 3
  ) {
    return 'HIGH';
  }

  if (lowerText.includes('vulnerability') || lowerText.includes('exploit')) {
    return 'HIGH';
  }

  return 'INFO';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
