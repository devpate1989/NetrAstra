/**
 * On-demand portal scrapes launch a headless browser and can run far longer
 * than any reasonable HTTP timeout, especially on a CPU-throttled host. If a
 * scrape doesn't resolve within `RESPONSE_TIMEOUT_MS`, let it continue in the
 * background and tell the caller it started instead of holding the request
 * open. Quick "not configured" skips (which resolve almost immediately) still
 * return their real result so the UI can show the reason right away.
 */
const RESPONSE_TIMEOUT_MS = 5_000;

export interface ScrapeStarted {
  started: true;
}

export async function raceOrBackground<T extends { skipped: boolean; reason?: string }>(
  task: Promise<T>,
  label: string,
  onComplete: (result: T) => void
): Promise<T | ScrapeStarted> {
  const timeout = new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), RESPONSE_TIMEOUT_MS));
  const outcome = await Promise.race([task, timeout]);

  if (outcome === "pending") {
    task.then(onComplete).catch((err) => console.error(`[${label}] background refresh failed:`, err));
    return { started: true };
  }

  return outcome;
}
