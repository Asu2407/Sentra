export function QuickChips({
  disabled,
  onCheckSchedule,
  onScanInbox,
  onTrySample,
}: {
  disabled: boolean;
  onCheckSchedule: () => void;
  onScanInbox: () => void;
  onTrySample: () => void;
}) {
  return (
    <div className="chips" aria-label="Quick assistant actions">
      <button type="button" className="tag" disabled={disabled} onClick={onCheckSchedule}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        Check my schedule
      </button>

      <button type="button" className="tag" disabled={disabled} onClick={onScanInbox}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M4 7l8 6 8-6" />
        </svg>
        Scan my inbox
      </button>

      <button type="button" className="tag" disabled={disabled} onClick={onTrySample}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v5M12 18v.5" />
        </svg>
        Try a sample email
      </button>
    </div>
  );
}
