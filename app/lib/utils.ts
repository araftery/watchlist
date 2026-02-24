import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Get today's date as YYYY-MM-DD in America/New_York timezone */
export function getTodayNY(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Get a date offset by `days` from today as YYYY-MM-DD in America/New_York timezone */
export function getDateNY(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
