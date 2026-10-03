import { describe, expect, test } from 'bun:test';
import {
  maskCredentialName,
  orderLedgerWindows,
  remainingPercent,
  summarizeRemaining,
} from '../src/features/quota/ledger';

describe('quota ledger', () => {
  test('keeps an unknown account distinct from an exhausted account', () => {
    expect(summarizeRemaining([0, null])).toEqual({ remaining: 0, loaded: 1, total: 2 });
    expect(summarizeRemaining([null, null])).toEqual({ remaining: null, loaded: 0, total: 2 });
    expect(summarizeRemaining([58, 100, 100, 51, 100])).toEqual({
      remaining: 409,
      loaded: 5,
      total: 5,
    });
  });

  test('does not render invalid usage as available capacity', () => {
    expect(remainingPercent(null)).toBeNull();
    expect(remainingPercent(Number.NaN)).toBeNull();
    expect(remainingPercent(120)).toBe(0);
    expect(remainingPercent(-4)).toBe(100);
    expect(remainingPercent(79)).toBe(21);
  });

  test('masks email identities without revealing them in filenames', () => {
    const masked = maskCredentialName('claude-123-example@private.example.json');
    expect(masked).toBe('claude-1•••le@p•••');
    expect(masked).not.toContain('example');
    expect(maskCredentialName('account.json')).toBe('account.json');
    expect(maskCredentialName('file.json · hello@private.example')).toBe('file.json · h•••lo@p•••');
  });

  test('keeps the overall weekly limit visible alongside scoped limits', () => {
    const windows = ['seven-day', 'seven-day-fable', 'five-hour', 'seven-day-sonnet'].map((id) => ({
      id,
      label: id,
      usedPercent: 50,
      resetLabel: '',
    }));
    expect(orderLedgerWindows(windows).map((window) => window.id)).toEqual([
      'seven-day-fable',
      'five-hour',
      'seven-day',
      'seven-day-sonnet',
    ]);
    expect(windows[0].id).toBe('seven-day');
  });
});
