import { runCctnsInvestigationsScrape } from "../services/scraping/cctnsPortal.service";

async function main() {
  console.log("Starting CCTNS scrape test...");
  const result = await runCctnsInvestigationsScrape();
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
