import { describe, expect, it } from 'vitest';

import { parseDueAt } from '../tools.js';

describe('parseDueAt', () => {
  it('treats trailing Z times as UTC', () => {
    const ts = parseDueAt('2025-12-08T09:00:00.000Z');
    expect(ts).not.toBeNull();
    const iso = new Date(ts ?? 0).toISOString();
    expect(iso).toBe('2025-12-08T09:00:00.000Z');
  });

  it('respects explicit timezone offsets', () => {
    const ts = parseDueAt('2025-12-08T09:00:00+02:00');
    expect(ts).not.toBeNull();
    const iso = new Date(ts ?? 0).toISOString();
    expect(iso).toBe('2025-12-08T07:00:00.000Z');
  });
});
