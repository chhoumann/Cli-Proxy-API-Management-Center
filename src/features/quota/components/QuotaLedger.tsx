import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNow } from '@/hooks/useNow';
import { useQuotaStore } from '@/stores';
import type { ResolvedTheme } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { QUOTA_TAB_ORDER } from '../constants';
import type { QuotaFileEntry } from '../logic';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import {
  maskCredentialName,
  orderLedgerWindows,
  remainingPercent,
  summarizeRemaining,
} from '../ledger';
import { QuotaCard } from './QuotaCard';
import styles from './QuotaLedger.module.scss';

type Props = {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  showEmails: boolean;
  canRefresh: boolean;
  resettingName: string | null;
  onRefresh: (entry: QuotaFileEntry) => void;
  onReset: (entry: QuotaFileEntry) => void;
};

function Meter({ remaining, label }: { remaining: number | null; label: string }) {
  return (
    <div
      className={styles.track}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={remaining ?? undefined}
      aria-valuetext={remaining === null ? '--' : `${Math.round(remaining)}%`}
    >
      <span
        className={
          remaining === null
            ? styles.unknown
            : remaining < 30
              ? styles.low
              : remaining < 70
                ? styles.medium
                : styles.high
        }
        style={{ width: `${remaining ?? 0}%` }}
      />
    </div>
  );
}

export function QuotaLedger(props: Props) {
  const {
    entries,
    quotaFor,
    resolvedTheme,
    showEmails,
    canRefresh,
    resettingName,
    onRefresh,
    onReset,
  } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const claude = useQuotaStore((state) => state.claudeQuota);
  const codex = useQuotaStore((state) => state.codexQuota);
  const quotaForRow = (entry: QuotaFileEntry) =>
    entry.type === 'claude'
      ? claude[getQuotaCacheKey(entry.file)]
      : entry.type === 'codex'
        ? codex[getQuotaCacheKey(entry.file)]
        : undefined;
  const groups = QUOTA_TAB_ORDER.map((type) => ({
    type,
    entries: entries.filter((entry) => entry.type === type),
  })).filter((group) => group.entries.length > 0);
  const coreGroups = groups.filter((group) => group.type === 'claude' || group.type === 'codex');

  return (
    <div className={styles.ledger}>
      {coreGroups.length > 0 && (
        <div className={styles.summary}>
          {coreGroups.map((group) => {
            const windowId = group.type === 'claude' ? 'seven-day' : 'weekly';
            const values = group.entries.map((entry) => {
              const quota = quotaForRow(entry);
              const window =
                quota?.status === 'success'
                  ? quota.windows.find((item) => item.id === windowId)
                  : undefined;
              return remainingPercent(window?.usedPercent ?? null);
            });
            const total = summarizeRemaining(values);
            const icon = getAuthFileIcon(group.type, resolvedTheme);
            return (
              <section className={styles.summaryCell} key={group.type}>
                <div className={styles.summaryHead}>
                  <strong>
                    {icon && <img src={icon} alt="" />}
                    {getTypeLabel(t, group.type)}
                  </strong>
                  <span>{t('quota_management.meta_credentials', { count: total.total })}</span>
                </div>
                <div className={styles.summaryLabel}>
                  {t('quota_management.ledger_weekly_remaining')}
                </div>
                <div className={styles.summaryValue} title={t('quota_management.ledger_sum_hint')}>
                  <b>{total.remaining === null ? '--' : `${Math.round(total.remaining)}%`}</b>
                  <span>/ {total.total * 100}%</span>
                </div>
                <div className={styles.segments}>
                  {values.map((value, index) => (
                    <Meter
                      key={getQuotaCacheKey(group.entries[index].file)}
                      remaining={value}
                      label={t('quota_management.ledger_weekly_remaining')}
                    />
                  ))}
                </div>
                <span className={styles.coverage}>
                  {t('quota_management.ledger_coverage', {
                    loaded: total.loaded,
                    total: total.total,
                  })}
                </span>
              </section>
            );
          })}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.type} className={styles.group}>
          <h2>
            {getTypeLabel(t, group.type)} <span>{group.entries.length}</span>
          </h2>
          {group.entries.map((entry) => {
            const key = getQuotaCacheKey(entry.file);
            const quota = quotaForRow(entry);
            if (entry.type !== 'claude' && entry.type !== 'codex') {
              return (
                <QuotaCard
                  key={key}
                  entry={entry}
                  quota={quotaFor(entry)}
                  resolvedTheme={resolvedTheme}
                  displayNameOverride={
                    showEmails
                      ? getQuotaDisplayName(entry.file)
                      : maskCredentialName(getQuotaDisplayName(entry.file))
                  }
                  canRefresh={canRefresh && !entry.file.disabled}
                  resetting={resettingName === key}
                  onRefresh={() => onRefresh(entry)}
                  onReset={() => onReset(entry)}
                />
              );
            }
            const displayName = getQuotaDisplayName(entry.file);
            const name = showEmails ? displayName : maskCredentialName(displayName);
            const windows = quota?.status === 'success' ? orderLedgerWindows(quota.windows) : [];
            const loading = quota?.status === 'loading';
            const resetting = resettingName === key;
            const disabled = !canRefresh || Boolean(entry.file.disabled) || loading || resetting;
            const adapter = QUOTA_ADAPTERS[entry.type];
            const canReset = quota?.status === 'success' && adapter.canResetQuota?.(quota);
            return (
              <article key={key} className={styles.row} aria-busy={loading}>
                <div className={styles.identity}>
                  <strong title={name}>{name}</strong>
                  <span>
                    {quota?.planType
                      ? entry.type === 'claude'
                        ? t(`claude_quota.${quota.planType}`)
                        : quota.planType
                      : getTypeLabel(t, entry.type)}
                  </span>
                  {entry.file.unavailable && (
                    <span className={styles.unavailable}>
                      {t('quota_management.ledger_unavailable')}
                    </span>
                  )}
                </div>
                <div className={styles.windows}>
                  {windows.map((window) => {
                    const remaining = remainingPercent(window.usedPercent);
                    const label = window.labelKey
                      ? t(window.labelKey, window.labelParams)
                      : window.label;
                    const reset = buildResetDisplay(
                      window.resetLabel,
                      window.resetAtMs,
                      now,
                      i18n.resolvedLanguage
                    );
                    return (
                      <div className={styles.window} key={window.id}>
                        <div className={styles.windowHead}>
                          <span>{label}</span>
                          <b>{remaining === null ? '--' : `${Math.round(remaining)}%`}</b>
                        </div>
                        <Meter remaining={remaining} label={label} />
                        <div className={styles.reset}>
                          {reset?.relative && <span>{reset.relative} · </span>}
                          {reset?.absolute || t('quota_management.ledger_no_reset')}
                        </div>
                      </div>
                    );
                  })}
                  {quota?.status === 'error' && (
                    <span className={styles.error} role="alert">
                      {quota.error || t('common.unknown_error')}
                    </span>
                  )}
                  {(!quota || quota.status === 'idle') && (
                    <span className={styles.pending}>{t(`${adapter.i18nPrefix}.idle`)}</span>
                  )}
                  {loading && (
                    <span className={styles.pending}>{t(`${adapter.i18nPrefix}.loading`)}</span>
                  )}
                  {quota?.status === 'success' && windows.length === 0 && (
                    <span className={styles.pending}>
                      {t(`${adapter.i18nPrefix}.empty_windows`)}
                    </span>
                  )}
                  {quota &&
                    'rateLimitResetCreditsAvailableCount' in quota &&
                    quota.rateLimitResetCreditsAvailableCount != null && (
                      <div className={styles.credits}>
                        <span>{t('quota_management.ledger_reset_credits')}</span>
                        <b>{quota.rateLimitResetCreditsAvailableCount}</b>
                      </div>
                    )}
                </div>
                <div className={styles.actions}>
                  {canReset && (
                    <button type="button" disabled={disabled} onClick={() => onReset(entry)}>
                      {t('codex_quota.reset_button')}
                    </button>
                  )}
                  <button type="button" disabled={disabled} onClick={() => onRefresh(entry)}>
                    <IconRefreshCw size={14} />
                    {t('auth_files.quota_refresh_single')}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
