import type { CodexQuotaWindow } from '@/types';

export type LedgerWindow = CodexQuotaWindow;

export function remainingPercent(used: number | null): number | null {
  return used === null || !Number.isFinite(used) ? null : 100 - Math.min(100, Math.max(0, used));
}

export function summarizeRemaining(values: readonly (number | null)[]) {
  const known = values.filter((value): value is number => value !== null);
  return {
    remaining: known.length ? known.reduce((sum, value) => sum + value, 0) : null,
    loaded: known.length,
    total: values.length,
  };
}

export function orderLedgerWindows(windows: readonly LedgerWindow[]): LedgerWindow[] {
  const rank = (id: string) =>
    id === 'seven-day-fable'
      ? 0
      : id === 'five-hour'
        ? 1
        : id === 'seven-day' || id === 'weekly'
          ? 2
          : 3;
  return [...windows].sort((a, b) => rank(a.id) - rank(b.id));
}

export function maskCredentialName(name: string): string {
  return name.replace(/([^\s@]+)@([^\s@]+)/g, (_match, local: string, domain: string) => {
    const prefix = local.startsWith('claude-')
      ? 'claude-'
      : local.startsWith('codex-')
        ? 'codex-'
        : '';
    return `${prefix}${local.slice(prefix.length, prefix.length + 1)}•••${local.length - prefix.length > 4 ? local.slice(-2) : ''}@${domain.slice(0, 1)}•••`;
  });
}
