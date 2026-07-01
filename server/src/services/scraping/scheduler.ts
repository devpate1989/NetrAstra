import cron from "node-cron";
import { runCctnsInvestigationsScrape } from "./cctnsPortal.service";
import { runJanSunwaiReferenceSummaryScrape, runJanSunwaiScrape } from "./janSunwaiPortal.service";
import { runPgSummaryScrape } from "./pgPortal.service";

/**
 * Schedules the CCTNS-portal and Jan Sunwai scrape jobs (prompt.md modules 8 & 9)
 * to run every 30 minutes so the allotment list stays current. Both scrapers
 * no-op (and log why) when their portal isn't configured yet, so this is
 * always safe to start.
 */
const SCRAPE_CRON_EXPRESSION = "*/30 * * * *";

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

    const referenceSummary = await runJanSunwaiReferenceSummaryScrape();
    if (referenceSummary.skipped) {
      console.log(`[scheduler] Jan Sunwai reference summary scrape skipped: ${referenceSummary.reason}`);
    } else {
      console.log(`[scheduler] Jan Sunwai reference summary scrape stored ${referenceSummary.stored} categories`);
    }

    const pg = await runPgSummaryScrape();
    if (pg.skipped) {
      console.log(`[scheduler] PG summary scrape skipped: ${pg.reason}`);
    } else {
      console.log(`[scheduler] PG summary scrape: pending=${pg.stored > 0 ? "stored" : "failed"}`);
    }
  });

  console.log(`[scheduler] Portal scrape jobs scheduled (cron "${SCRAPE_CRON_EXPRESSION}")`);
}
