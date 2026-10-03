import { randomInt } from "node:crypto";

// Human-friendly order reference, e.g. PFC-20261003-0427
export function generateReference(date = new Date()): string {
  // Today's date as YYYYMMDD
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");

  // Random 4-digit suffix (the database enforces uniqueness; the service retries on a clash)
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");

  return `PFC-${ymd}-${suffix}`;
}
