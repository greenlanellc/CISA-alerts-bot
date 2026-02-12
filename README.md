# CISA Advisory Monitor

A stateless GitHub Action that monitors [CISA Cybersecurity Alerts](https://www.cisa.gov/news-events/cybersecurity-advisories?f%5B0%5D=advisory_type%3A93) and sends structured alerts to **Slack** and **Telegram** — no database required.

## How It Works

```
GitHub Scheduled Workflow (hourly)
        ↓
Scrape CISA Advisory Listing Page
        ↓
Compare Against State File (JSON)
        ↓
For Each New Advisory:
    → Fetch Inner Page
    → Extract CVEs, Severity, Products
    → Format Rich Alert
    → Send to Slack / Telegram
        ↓
Update State File
```

- **Deduplication** is handled via `state/processed-advisories.json` — no external database needed.
- Advisories are only marked as processed **after** successful alert delivery.
- Runs in under 120 seconds per cycle.

---

## Setup

### 1. Fork / Clone

```bash
git clone https://github.com/YOUR_USER/CISA-cyber-alerts-bot.git
cd CISA-cyber-alerts-bot
npm install
```

### 2. Configure GitHub Secrets

Go to your repository **Settings → Secrets and variables → Actions** and add:

| Secret               | Required | Description                          |
| -------------------- | -------- | ------------------------------------ |
| `SLACK_WEBHOOK_URL`  | No*      | Slack Incoming Webhook URL           |
| `TELEGRAM_BOT_TOKEN` | No*      | Telegram Bot API token               |
| `TELEGRAM_CHAT_ID`   | No*      | Telegram chat/group/channel ID       |

> \* At least one channel (Slack or Telegram) should be configured for alerts to be delivered.

### 3. Optional Configuration Variables

Set these as **Repository Variables** (Settings → Variables → Actions) or environment variables:

| Variable           | Default | Description                              |
| ------------------ | ------- | ---------------------------------------- |
| `SCAN_LIMIT`       | `10`    | Max advisories to scan per run (1–50)    |
| `LOG_LEVEL`        | `info`  | Log verbosity: `debug`, `info`, `warn`, `error` |
| `SLACK_ENABLED`    | `true`  | Enable/disable Slack alerts              |
| `TELEGRAM_ENABLED` | `true`  | Enable/disable Telegram alerts           |

### 4. Enable GitHub Actions

The workflow is at `.github/workflows/cisa-monitor.yml`. It runs automatically every hour. You can also trigger it manually from the **Actions** tab.

---

## Changing the Schedule

Edit the cron expression in `.github/workflows/cisa-monitor.yml`:

```yaml
on:
  schedule:
    - cron: "0 * * * *"    # Every hour (default)
    # - cron: "*/30 * * * *"  # Every 30 minutes
    # - cron: "0 */6 * * *"   # Every 6 hours
    # - cron: "0 9 * * 1-5"   # Weekdays at 9 AM UTC
```

---

## Local Development

```bash
# Install dependencies
npm install

# Run with no alerts (dry run)
SLACK_ENABLED=false TELEGRAM_ENABLED=false LOG_LEVEL=debug npx tsx src/index.ts

# Run with Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... npx tsx src/index.ts

# Run with Telegram
TELEGRAM_BOT_TOKEN=123:ABC TELEGRAM_CHAT_ID=-100123 npx tsx src/index.ts

# Type-check
npm run typecheck
```

---

## Example Alert Messages

### Slack (Block Kit)

```
🔴 CISA Alert: CISA Adds Six Known Exploited Vulnerabilities to Catalog

🛡️ Severity:        📅 Published:
🔴 CRITICAL          Feb 10, 2026

🔥 KNOWN ACTIVE EXPLOITATION — Immediate action recommended

🐛 CVEs (6):
CVE-2026-21510  CVE-2026-21513  CVE-2026-21514
CVE-2026-21519  CVE-2026-21525  CVE-2026-21533

📝 Summary:
CISA has added six new vulnerabilities to its Known Exploited
Vulnerabilities (KEV) Catalog, based on evidence of active exploitation.

🔗 Read Full Advisory

🛡️ CISA Advisory Monitor • Automated alert
```

### Telegram (HTML)

```
🔴 CISA Alert: CISA Adds Six Known Exploited Vulnerabilities to Catalog

🛡️ Severity: 🔴 CRITICAL
🔥 ⚠️ KNOWN ACTIVE EXPLOITATION
📅 Published: Feb 10, 2026

🐛 CVEs (6):
  CVE-2026-21510
  CVE-2026-21513
  CVE-2026-21514
  CVE-2026-21519
  CVE-2026-21525
  CVE-2026-21533

📝 Summary:
CISA has added six new vulnerabilities to its Known Exploited
Vulnerabilities (KEV) Catalog...

🔗 Read Full Advisory

🛡️ CISA Advisory Monitor • Automated alert
```

---

## Severity Levels

| Icon | Level      | Trigger                                                  |
| ---- | ---------- | -------------------------------------------------------- |
| 🔴   | `CRITICAL` | Known exploitation, CVSS 9+, RCE, or text says "critical" |
| 🟠   | `HIGH`     | CVSS 7–8.9, 3+ CVEs, or text says "high"                |
| 🔵   | `INFO`     | General informational advisory                           |

---

## Project Structure

```
src/
  index.ts            # Main orchestrator
  config.ts           # Zod-validated configuration
  logger.ts           # Pino structured logger
  types.ts            # Shared TypeScript types
  cisaScraper.ts      # CISA listing page scraper
  advisoryParser.ts   # Inner page parser + enrichment
  alertFormatter.ts   # Slack Block Kit + Telegram HTML formatter
  slack.ts            # Slack webhook notifier
  telegram.ts         # Telegram Bot API notifier
  stateManager.ts     # JSON file-based state/deduplication
state/
  processed-advisories.json  # Persisted dedup state
.github/workflows/
  cisa-monitor.yml    # GitHub Actions workflow
```

---

## Tech Stack

- **Node.js 20** + **TypeScript** (strict mode)
- **Axios** — HTTP client with timeout/retry
- **Cheerio** — HTML parsing
- **Pino** — Structured JSON logging
- **Zod** — Config validation

---

## License

MIT
