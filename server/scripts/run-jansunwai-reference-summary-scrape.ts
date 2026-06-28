// Live test of the reference-summary scrape (now including the new
// defaulter-in-3-days scrape + is_defaulter_soon sync) — logs in, scrapes,
// and prints the result summary.
import { runJanSunwaiReferenceSummaryScrape } from "../src/services/scraping/janSunwaiPortal.service";

runJanSunwaiReferenceSummaryScrape()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.skipped ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
