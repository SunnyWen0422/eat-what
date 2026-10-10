import type { LocalDate, TimeZone } from './types.ts';

export function localDate(now: Date, zone: TimeZone): LocalDate {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError('Invalid date');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const value = `${part('year')}-${part('month')}-${part('day')}`;
  if (!isLocalDate(value)) throw new RangeError('Date is outside the supported calendar');
  return value as LocalDate;
}
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(`${value}T`);
}
export function isUtcIso(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
/** Compare validated civil dates, not elapsed local hours (which differ at DST). */
export function isRecentLocalDate(date: LocalDate, today: LocalDate): boolean {
  if (!isLocalDate(date) || !isLocalDate(today)) return false;
  const days = (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000;
  return days >= 0 && days < 7;
}
