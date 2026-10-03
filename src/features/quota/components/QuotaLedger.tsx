/**
 * Ledger layout: a summary strip that sums each provider's accounts, then one
 * dense row per credential with every quota window side by side.
 *
 * Quota arrives through `quotaFor` from the page rather than from store
 * subscriptions here, so the page's session isolation covers this view too.
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import { useNow } from '@/hooks/useNow';
import type { ResolvedTheme } from '@/types';
import {
  buildResetDisplay,
  formatInstantShort,
  formatRelativeInstant,
  resolveQuotaErrorMessage,
  type ResetDisplay,
} from '@/utils/quota';
import { getQuotaCacheKey, getQuotaDisplayName } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { QUOTA_TAB_ORDER } from '../constants';
import {
  codexManualResets,
  ledgerMeters,
  ledgerPlan,
  maskCredentialName,
  orderLedgerMeters,
  summarizeLedger,
  type LedgerMeter,
  type LedgerSummaryWindow,
} from '../ledger';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import type { QuotaProviderType } from '../providers/types';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import { QUOTA_PROGRESS_HIGH_THRESHOLD, QUOTA_PROGRESS_MEDIUM_THRESHOLD } from './QuotaMeter';
import styles from './QuotaLedger.module.scss';

export type QuotaLedgerProps = {
  /** Rows on the current page. */
  entries: QuotaFileEntry[];
  /** Every filtered entry, so the summary covers all pages. */
  summaryEntries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
  showEmails: boolean;
  canRefresh: boolean;
  resettingName: string | null;
  onRefresh: (entry: QuotaFileEntry) => void;
  onReset: (entry: QuotaFileEntry) => void;
};

const groupByProvider = (entries: readonly QuotaFileEntry[]) =>
  QUOTA_TAB_ORDER.map((type) => ({
    type,
    entries: entries.filter((entry) => entry.type === type),
  })).filter((group) => group.entries.length > 0);

const toneClass = (remaining: number | null): string =>
  remaining === null
    ? ''
    : remaining >= QUOTA_PROGRESS_HIGH_THRESHOLD
      ? styles.fillHigh
      : remaining >= QUOTA_PROGRESS_MEDIUM_THRESHOLD
        ? styles.fillMedium
        : styles.fillLow;

const formatPercent = (value: number | null): string =>
  value === null ? '--' : `${Math.round(value)}%`;

export function QuotaLedger(props: QuotaLedgerProps) {
  const { entries, summaryEntries, quotaFor, resolvedTheme, showEmails } = props;
  const { t } = useTranslation();
  const now = useNow();

  const summaries = new Map(
    groupByProvider(summaryEntries).map(({ type, entries: group }) => [
      type,
      {
        accounts: group.length,
        windows: summarizeLedger(
          type,
          group.map((entry) => ledgerMeters(type, quotaFor(entry), t)),
          now
        ),
      },
    ])
  );

  return (
    <div className={styles.ledger}>
      {summaries.size > 0 && (
        <div className={styles.summary}>
          {[...summaries].map(([type, summary]) => (
            <SummaryCell
              key={type}
              type={type}
              accounts={summary.accounts}
              windows={summary.windows}
              resolvedTheme={resolvedTheme}
              now={now}
            />
          ))}
        </div>
      )}

      {groupByProvider(entries).map((group) => (
        <section key={group.type} className={styles.group}>
          <h2 className={styles.groupTitle}>
            {getTypeLabel(t, group.type)}
            <span className={styles.groupCount}>{group.entries.length}</span>
          </h2>
          {group.entries.map((entry) => {
            const key = getQuotaCacheKey(entry.file);
            return (
              <LedgerRow
                key={key}
                entry={entry}
                quota={quotaFor(entry)}
                summary={summaries.get(group.type)?.windows ?? []}
                showEmails={showEmails}
                canRefresh={props.canRefresh && !entry.file.disabled}
                resetting={props.resettingName === key}
                now={now}
                onRefresh={() => props.onRefresh(entry)}
                onReset={() => props.onReset(entry)}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ProviderIcon({
  type,
  resolvedTheme,
}: {
  type: QuotaProviderType;
  resolvedTheme: ResolvedTheme;
}) {
  const { t } = useTranslation();
  const src = getAuthFileIcon(type, resolvedTheme);
  return (
    <span
      className={styles.iconWrap}
      style={
        isThemeSurfaceIconProvider(type)
          ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
          : undefined
      }
    >
      {src ? (
        <img src={src} alt="" className={styles.icon} />
      ) : (
        <span className={styles.iconFallback}>{getTypeLabel(t, type).slice(0, 1)}</span>
      )}
    </span>
  );
}

function SummaryCell(props: {
  type: QuotaProviderType;
  accounts: number;
  windows: LedgerSummaryWindow[];
  resolvedTheme: ResolvedTheme;
  now: number;
}) {
  const { type, accounts, windows, resolvedTheme, now } = props;
  const { t } = useTranslation();
  const [headline, ...secondary] = windows;

  return (
    <section className={styles.cell}>
      <header className={styles.cellHead}>
        <ProviderIcon type={type} resolvedTheme={resolvedTheme} />
        <span className={styles.cellName}>{getTypeLabel(t, type)}</span>
        <span className={styles.cellCount}>
          {t('quota_management.meta_credentials', { count: accounts })}
        </span>
      </header>
      {headline && <div className={styles.headlineLabel}>{headline.label}</div>}
      <div className={styles.headlineValue}>
        <span className={styles.headlineNumber}>{formatPercent(headline?.remaining ?? null)}</span>
        <span className={styles.headlineCapacity}>
          {t('quota_management.ledger_of_capacity', { capacity: accounts * 100 })}
        </span>
      </div>
      <SegmentBar segments={headline?.segments ?? Array.from({ length: accounts }, () => null)} />
      <SummaryReset atMs={headline?.nextResetAtMs ?? null} now={now} />
      {secondary.map((window) => (
        <SecondaryWindow key={window.id} window={window} now={now} />
      ))}
    </section>
  );
}

function SecondaryWindow({ window, now }: { window: LedgerSummaryWindow; now: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.secondary}>
      <div className={styles.secondaryLine}>
        <span className={styles.secondaryLabel}>{window.label}</span>
        <span className={styles.secondaryValue}>{formatPercent(window.remaining)}</span>
        <button
          type="button"
          className={styles.secondaryToggle}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t(open ? 'quota_management.ledger_hide' : 'quota_management.ledger_show')}
        </button>
      </div>
      {open && (
        <>
          <SegmentBar segments={window.segments} />
          <SummaryReset atMs={window.nextResetAtMs} now={now} />
        </>
      )}
    </div>
  );
}

function SegmentBar({ segments }: { segments: readonly (number | null)[] }) {
  return (
    <div className={styles.segments} aria-hidden="true">
      {segments.map((remaining, index) => (
        <span key={index} className={styles.track}>
          <span
            className={`${styles.fill} ${toneClass(remaining)}`}
            style={{ width: `${remaining ?? 0}%` }}
          />
        </span>
      ))}
    </div>
  );
}

function SummaryReset({ atMs, now }: { atMs: number | null; now: number }) {
  const { i18n } = useTranslation();
  const display =
    atMs === null
      ? null
      : {
          absolute: formatInstantShort(atMs),
          relative: formatRelativeInstant(atMs, now, i18n.resolvedLanguage),
        };
  return <ResetLine display={display} className={styles.summaryReset} />;
}

/** `in 1 day · 09/12, 23:00`, optionally led by a label such as `Reset 1`. */
function ResetLine(props: { display: ResetDisplay | null; lead?: string; className?: string }) {
  const { display, lead, className } = props;
  const { t } = useTranslation();
  const parts: ReactNode[] = [];
  if (lead) parts.push(<span key="lead">{lead}</span>);
  if (!display) {
    parts.push(<span key="none">{t('quota_management.ledger_no_reset')}</span>);
  } else {
    if (display.relative) {
      parts.push(
        <span key="relative" className={styles.resetRelative}>
          {display.relative}
        </span>
      );
    }
    parts.push(<span key="absolute">{display.absolute}</span>);
  }
  return (
    <div className={`${styles.reset} ${className ?? ''}`}>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
    </div>
  );
}

type LedgerRowProps = {
  entry: QuotaFileEntry;
  quota: QuotaCardState | undefined;
  summary: readonly LedgerSummaryWindow[];
  showEmails: boolean;
  canRefresh: boolean;
  resetting: boolean;
  now: number;
  onRefresh: () => void;
  onReset: () => void;
};

function LedgerRow(props: LedgerRowProps) {
  const { entry, quota, summary, showEmails, canRefresh, resetting, now, onRefresh, onReset } =
    props;
  const { t, i18n } = useTranslation();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || resetting,
    quota,
    onRefresh
  );

  const displayName = getQuotaDisplayName(file);
  const name = showEmails ? displayName : maskCredentialName(displayName, entry.type);
  const meters = orderLedgerMeters(ledgerMeters(entry.type, quota, t), summary);
  const secondaryIds = new Set(summary.slice(1).map((window) => window.id));
  const codexResets = entry.type === 'codex' ? codexManualResets(quota) : null;
  const showClaudeResets =
    entry.type === 'claude' &&
    ((claudeReset.count ?? 0) > 0 || claudeReset.buttonLabel === 'retry');
  const showCodexReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));
  const locale = i18n.resolvedLanguage;

  return (
    <article className={styles.row} aria-busy={loading || undefined}>
      <div className={styles.identity}>
        <div className={styles.name} title={name}>
          {name}
        </div>
        <IdentityDetails entry={entry} quota={quota} now={now} />
        {file.unavailable && (
          <div className={styles.unavailable}>{t('quota_management.ledger_unavailable')}</div>
        )}
      </div>

      <div className={styles.meters}>
        {status === 'idle' ? (
          <button type="button" className={styles.idle} onClick={onRefresh} disabled={!canRefresh}>
            {t(`${adapter.i18nPrefix}.idle`)}
          </button>
        ) : loading ? (
          <span className={styles.statusText}>{t(`${adapter.i18nPrefix}.loading`)}</span>
        ) : status === 'error' ? (
          <span className={styles.errorText} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, {
              message: resolveQuotaErrorMessage(
                t,
                quota?.errorStatus,
                quota?.error || t('common.unknown_error')
              ),
            })}
          </span>
        ) : meters.length === 0 && !codexResets ? (
          <span className={styles.statusText}>{t('quota_management.ledger_no_windows')}</span>
        ) : (
          meters.map((meter) => (
            <Meter
              key={meter.id}
              meter={meter}
              secondary={secondaryIds.has(meter.id)}
              reset={buildResetDisplay(meter.resetLabel, meter.resetAtMs, now, locale)}
            />
          ))
        )}
        {codexResets && (
          <ManualResets
            available={codexResets.available}
            detail={
              codexResets.next && (
                <ResetLine
                  lead={t('codex_quota.reset_credit_number', { index: codexResets.next.number })}
                  display={buildResetDisplay(
                    codexResets.next.expiresAtMs === null
                      ? codexResets.next.expiresLabel
                      : formatInstantShort(codexResets.next.expiresAtMs),
                    codexResets.next.expiresAtMs,
                    now,
                    locale
                  )}
                />
              )
            }
          />
        )}
        {showClaudeResets && (
          <ManualResets
            available={claudeReset.count}
            detail={
              claudeReset.message && (
                <div className={styles.manualMessage} role="status">
                  {t(`claude_reset.${claudeReset.message}`)}
                </div>
              )
            }
          />
        )}
      </div>

      <div className={styles.actions}>
        {showCodexReset && (
          <ActionButton
            label={t('codex_quota.reset_button')}
            busy={resetting}
            disabled={!canRefresh || loading || resetting}
            onClick={onReset}
          />
        )}
        {showClaudeResets && (
          <ActionButton
            label={t(`claude_reset.${claudeReset.buttonLabel}`)}
            busy={claudeReset.busy}
            disabled={claudeReset.blocked}
            onClick={claudeReset.confirm}
          />
        )}
        <ActionButton
          label={t('auth_files.quota_refresh_single')}
          title={t('auth_files.quota_refresh_hint')}
          busy={loading}
          disabled={isQuotaRefreshDisabled(canRefresh, loading, resetting || claudeReset.busy)}
          onClick={onRefresh}
        />
      </div>
    </article>
  );
}

function IdentityDetails(props: {
  entry: QuotaFileEntry;
  quota: QuotaCardState | undefined;
  now: number;
}) {
  const { entry, quota, now } = props;
  const { t, i18n } = useTranslation();
  const plan = ledgerPlan(entry.type, quota, t);
  const parts: ReactNode[] = [];

  if (plan && plan.renewsAtMs !== null) {
    parts.push(
      <span key="plan" className={styles.planStrong}>
        {plan.label}
      </span>,
      <span key="renews">
        {`${t('quota_management.ledger_renews')} `}
        <span className={styles.detailStrong}>{formatInstantShort(plan.renewsAtMs)}</span>
      </span>,
      <span key="renews-relative">
        {formatRelativeInstant(plan.renewsAtMs, now, i18n.resolvedLanguage)}
      </span>
    );
  } else if (plan) {
    parts.push(<span key="plan">{plan.label}</span>);
  }
  if (Number.isSafeInteger(entry.file.priority)) {
    parts.push(
      <span key="priority">{`${t('auth_files.priority_display')} ${entry.file.priority}`}</span>
    );
  }
  if (entry.file.websockets === true) {
    parts.push(<span key="websockets">{t('providersPage.table.websocketsTag')}</span>);
  }

  if (parts.length === 0) return null;
  return (
    <div className={styles.details}>
      {parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
    </div>
  );
}

function Meter(props: { meter: LedgerMeter; secondary: boolean; reset: ResetDisplay | null }) {
  const { meter, secondary, reset } = props;
  return (
    <div className={`${styles.meter} ${secondary ? styles.meterSecondary : ''}`}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel} title={meter.label}>
          {meter.label}
        </span>
        <span className={styles.meterPercent}>{formatPercent(meter.remaining)}</span>
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meter.remaining ?? undefined}
        aria-valuetext={formatPercent(meter.remaining)}
      >
        <span
          className={`${styles.fill} ${toneClass(meter.remaining)}`}
          style={{ width: `${meter.remaining ?? 0}%` }}
        />
      </div>
      <ResetLine display={reset} />
    </div>
  );
}

function ManualResets({ available, detail }: { available: number | null; detail: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span className={styles.meterLabel}>{t('codex_quota.reset_credits_label')}</span>
      </div>
      <div className={styles.available}>
        <span className={styles.availableCount}>{available ?? '--'}</span>
        <span>{t('quota_management.ledger_available')}</span>
      </div>
      {detail}
    </div>
  );
}

function ActionButton(props: {
  label: string;
  title?: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { label, title, busy, disabled, onClick } = props;
  return (
    <button
      type="button"
      className={styles.action}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      <IconRefreshCw size={13} aria-hidden="true" className={busy ? styles.spinning : undefined} />
      {label}
    </button>
  );
}
