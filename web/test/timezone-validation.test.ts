import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTimeZone } from '../src/domain/validation.ts';
afterEach(() => vi.restoreAllMocks());
describe('bounded reuse of timezone validity', () => {
  it('retains valid and invalid Intl timezone rules while avoiding repeated formatter construction', () => {
    const formatter = vi.spyOn(Intl, 'DateTimeFormat');
    for (let index = 0; index < 1_000; index++) {
      expect(isTimeZone('Antarctica/Troll')).toBe(true);
      expect(isTimeZone('Invalid/RepeatedTimezone')).toBe(false);
    }
    expect(formatter.mock.calls.length).toBeLessThanOrEqual(2);
    expect(isTimeZone('')).toBe(false); expect(isTimeZone(null)).toBe(false);
    expect(isTimeZone('UTC')).toBe(true); expect(isTimeZone('Asia/Shanghai')).toBe(true);
  });
  it('bounds retained keys without treating an evicted valid timezone as invalid', () => {
    expect(isTimeZone('Atlantic/Reykjavik')).toBe(true);
    for (let index = 0; index < 512; index++) expect(isTimeZone(`Invalid/Eviction-${index}`)).toBe(false);
    const formatter = vi.spyOn(Intl, 'DateTimeFormat');
    expect(isTimeZone('Atlantic/Reykjavik')).toBe(true);
    expect(formatter).toHaveBeenCalledOnce();
  });
});
