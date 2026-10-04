const STATUS_STYLES = {
  PENDING: 'bg-slate-100 text-slate-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  ON_HOLD: 'bg-slate-200 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

const PRIORITY_STYLES = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

const WORKLOAD_STYLES = {
  FREE: 'bg-slate-100 text-slate-600',
  LIGHT: 'bg-emerald-100 text-emerald-700',
  BALANCED: 'bg-blue-100 text-blue-700',
  HEAVY: 'bg-amber-100 text-amber-800',
  OVERLOADED: 'bg-red-100 text-red-700',
  INACTIVE: 'bg-slate-200 text-slate-500',
};

const RISK_STYLES = {
  OVERDUE: 'bg-red-100 text-red-700',
  CRITICAL: 'bg-orange-100 text-orange-700',
  AT_RISK: 'bg-amber-100 text-amber-800',
  ON_TRACK: 'bg-emerald-100 text-emerald-700',
  NO_DEADLINE: 'bg-slate-100 text-slate-500',
  DONE: 'bg-slate-100 text-slate-500',
};

const SUPPLY_STYLES = {
  AVAILABLE: 'bg-emerald-100 text-emerald-700',
  SCARCE: 'bg-amber-100 text-amber-800',
  CRITICAL_GAP: 'bg-red-100 text-red-700',
  IDLE: 'bg-slate-100 text-slate-500',
};

const badge = (styles, value) => (
  <span className={`badge ${styles[value] || 'bg-slate-100 text-slate-700'}`}>
    {String(value || '').replace(/_/g, ' ')}
  </span>
);

export const StatusBadge = ({ status }) => badge(STATUS_STYLES, status);
export const PriorityBadge = ({ priority }) => (
  <span className={`badge border ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.LOW}`}>
    {priority}
  </span>
);
export const WorkloadBadge = ({ level }) => badge(WORKLOAD_STYLES, level);
export const RiskBadge = ({ risk }) => badge(RISK_STYLES, risk);
export const SupplyBadge = ({ status }) => badge(SUPPLY_STYLES, status);

/** Utilisation bar: green -> amber -> red as hours fill up. */
export function UtilisationBar({ percent = 0, showLabel = true, className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const colour =
    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : pct >= 50 ? 'bg-blue-500' : 'bg-emerald-500';

  return (
    <div className={className}>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="text-xs font-semibold text-slate-600 tabular-nums">{Math.round(pct)}%</span>
      )}
    </div>
  );
}

export function StatusBadgeGroup({ status, priority }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusBadge status={status} />
      {priority && priority !== 'MEDIUM' && <PriorityBadge priority={priority} />}
    </div>
  );
}