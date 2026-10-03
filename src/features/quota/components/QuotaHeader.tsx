import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw, IconSearch, IconX } from '@/components/ui/icons';
import { useCountUp } from '@/hooks/motion';
import styles from './QuotaHeader.module.scss';

export type QuotaHeaderProps = {
  totalCount: number;
  loadedCount: number;
  attentionCount: number;
  refreshing: boolean;
  disableControls: boolean;
  onRefreshAll: () => void;
  /** Rendered before the refresh pill. */
  actions?: ReactNode;
};

/**
 * 额度页头部：标题领衔 + ▍mono 遥测 meta 行 + 墨色药丸「刷新全部」。
 * 与凭证库头部同语汇（无 eyebrow —— ▍游标挂在 meta 行开头）。
 *
 * 入场：三处 `data-reveal` 交给页面壳的 useRevealGroup 统一编排
 * （标题 0ms → meta 70ms → 动作 140ms → tabs 210ms）。
 */
export function QuotaHeader(props: QuotaHeaderProps) {
  const {
    totalCount,
    loadedCount,
    attentionCount,
    refreshing,
    disableControls,
    onRefreshAll,
    actions,
  } = props;
  const { t } = useTranslation();
  // 批量结果陆续落地时，「已加载」是页面上唯一滚动的数字
  const displayLoadedCount = useCountUp(loadedCount);

  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <h1 className={styles.title} data-reveal>
          {t('quota_management.title')}
        </h1>
        <p className={styles.meta} data-reveal>
          <span className={styles.metaTotal}>
            {t('quota_management.meta_credentials', { count: totalCount })}
          </span>
          <span className={styles.metaDot} aria-hidden="true">
            ·
          </span>
          <span className={loadedCount > 0 ? styles.metaLoaded : styles.metaMuted}>
            {t('quota_management.meta_loaded', { count: displayLoadedCount })}
          </span>
          {attentionCount > 0 && (
            <>
              <span className={styles.metaDot} aria-hidden="true">
                ·
              </span>
              <span className={styles.metaAttention}>
                {t('quota_management.meta_attention', { count: attentionCount })}
              </span>
            </>
          )}
        </p>
      </div>
      <div className={styles.actions} data-reveal>
        {actions}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRefreshAll}
          disabled={disableControls || refreshing}
        >
          <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
          {t('quota_management.refresh_all_credentials')}
        </button>
      </div>
    </header>
  );
}

/**
 * Search behind an icon: the field opens on demand and stays open while it
 * holds a query, so an active filter is never hidden.
 */
export function QuotaHeaderSearch(props: { value: string; onChange: (value: string) => void }) {
  const { value, onChange } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const expanded = open || value !== '';

  useEffect(() => {
    if (!expanded && restoreFocus.current) {
      restoreFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [expanded]);

  if (!expanded) {
    return (
      <button
        ref={toggleRef}
        type="button"
        className={styles.iconAction}
        aria-label={t('quota_management.search_label')}
        title={t('quota_management.search_label')}
        onClick={() => setOpen(true)}
      >
        <IconSearch size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className={styles.search}>
      <IconSearch size={14} className={styles.searchIcon} aria-hidden="true" />
      <input
        ref={inputRef}
        className={styles.searchInput}
        type="search"
        value={value}
        autoFocus
        placeholder={t('quota_management.search_placeholder')}
        aria-label={t('quota_management.search_label')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          restoreFocus.current = true;
          onChange('');
          setOpen(false);
        }}
        onBlur={() => {
          if (value === '') setOpen(false);
        }}
      />
      {value !== '' && (
        <button
          type="button"
          className={styles.clearSearch}
          aria-label={t('quota_management.search_clear')}
          title={t('quota_management.search_clear')}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <IconX size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function QuotaHeaderToggle(props: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.secondaryAction}
      aria-pressed={props.pressed}
      onClick={props.onToggle}
    >
      {props.children}
    </button>
  );
}
