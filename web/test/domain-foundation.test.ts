import { describe, expect, it } from 'vitest';
import { localDate } from '../src/domain/dates.ts';
import { validatePersonalData } from '../src/domain/validation.ts';
import { personalData } from './fixtures.ts';
import type { TimeZone } from '../src/domain/types.ts';

describe('foundation validators and local dates', () => {
  it('accepts only the initial empty valid ten-store personal envelope', () => {
    expect(validatePersonalData(personalData()).ok).toBe(true);
    expect(validatePersonalData({}).ok).toBe(false);
    const data = personalData(); data.preferences.servings = 51; expect(validatePersonalData(data).ok).toBe(false);
  });
  it('rejects incomplete populated personal records', () => {
    const data = personalData(); (data.plans as unknown[]).push({ id: 'pending', revision: 0, requestId: 'test' });
    expect(validatePersonalData(data).ok).toBe(false);
  });
  it('rejects dangerous keys and overlong strings', () => {
    expect(validatePersonalData(JSON.parse('{"__proto__":{}}')).ok).toBe(false);
    const data = personalData(); data.preferences.softPreferences = ['x'.repeat(20001)]; expect(validatePersonalData(data).ok).toBe(false);
  });
  it('uses the specified timezone on either side of midnight', () => {
    const now = new Date('2026-10-09T00:30:00.000Z');
    expect(localDate(now, 'America/Los_Angeles' as TimeZone)).toBe('2026-10-08');
    expect(localDate(now, 'Asia/Shanghai' as TimeZone)).toBe('2026-10-09');
  });
  it('rejects invalid date or timezone inputs', () => {
    expect(() => localDate(new Date('invalid'), 'UTC' as TimeZone)).toThrow();
    expect(() => localDate(new Date(), 'not-a-zone' as TimeZone)).toThrow();
  });
});
