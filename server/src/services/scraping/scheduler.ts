import cron from "node-cron";
import { runCctnsInvestigationsScrape } from "./cctnsPortal.service";
import { runJanSunwaiScrape } from "./janSunwaiPortal.service";

/**
 * Schedules the CCTNS-portal and Jan Sunwai scrape jobs (prompt.md modules 8 & 9)
 * to run automatically so dashboards stay reasonably fresh without anyone
 * having to remember to hit "refresh". Both scrapers no-op (and log why) when
 * their portal isn't configured yet, so this is always safe to start.
 *
 * Runs at 6:00, 12:00 and 18:00 server time — frequent enough to catch new
 * pending items within a shift, infrequent enough not to hammer the portals
 * or look like abuse of someone else's login session.
 */
const SCRAPE_CRON_EXPRESSION = "0 6,12,18 * * *";

let started = false;

export function startScrapeScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule(SCRAPE_CRON_EXPRESSION, async () => {
    const cctns = await runCctnsInvestigationsScrape();
    if (cctns.skipped) {
      console.log(`[scheduler] CCTNS scrape skipped: ${cctns.reason}`);
    } else {
      console.log(`[scheduler] CCTNS scrape stored ${cctns.stored}/${cctns.scraped} investigations`);
    }

    const jansunwai = await runJanSunwaiScrape();
    if (jansunwai.skipped) {
      console.log(`[scheduler] Jan Sunwai scrape skipped: ${jansunwai.reason}`);
    } else {
      console.log(`[scheduler] Jan Sunwai scrape stored ${jansunwai.stored}/${jansunwai.scraped} applications`);
    }
  });

  console.log(`[scheduler] Portal scrape jobs scheduled (cron "${SCRAPE_CRON_EXPRESSION}")`);
}
