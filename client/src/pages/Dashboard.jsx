import { Link } from 'react-router-dom';
import { PageHeader, DataBoundary } from '../components/layout';
import { StatusBadge, PriorityBadge } from '../lib/badges';
import { fmtHours, relativeDeadline } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { reportsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

function KpiCard({ label, value, sub, tone = 'slate', to }) {
  const tones = {
    slate: 'text-slate-900',
    brand: 'text-brand-700',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  };
  const body = (
    <div className="card h-full p-5 transition-shadow hover:shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

/** Horizontal bar list, used for the status / workload breakdowns. */
function BarList({ items, total, colourFor }) {
  if (!items?.length) return <p className="py-6 text-center text-sm text-slate-400">No data</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = total > 0 ? (item.count / total) * 100 : 0;
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className="tabular-nums text-slate-500">{item.count}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${colourFor(item.label)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const STATUS_COLOURS = {
  PENDING: 'bg-slate-400',
  ASSIGNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-amber-500',
  REVIEW: 'bg-purple-500',
  COMPLETED: 'bg-emerald-500',
  ON_HOLD: 'bg-slate-300',
  CANCELLED: 'bg-red-400',
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data, loading, error, refresh } = useApi(() => reportsApi.dashboard(), []);

  // Defaults keep the KPI row renderable on the very first paint, before the
  // dashboard request resolves.
  const totals = data?.totals ?? {
    active_employees: 0,
    departments: 0,
    total_tasks: 0,
    completed_tasks: 0,
    pending_allocation: 0,
    in_progress: 0,
    overdue_tasks: 0,
    open_estimated_hours: 0,
  };
  const totalByStatus = totals.total_tasks;

  // Safe views of the report payload, so the markup never dereferences null on
  // the first render (JSX children are evaluated even while DataBoundary spins).
  const recentTasks = data?.recent_tasks ?? [];
  const byStatus = data?.by_status ?? [];
  const workloadRows = data?.workload ?? [];
  const skillGaps = data?.skill_gaps ?? [];
  const topPerformers = data?.top_performers ?? [];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'there'}`}
        description="Live picture of capacity, workload and task flow across the organisation."
        actions={
          <Link to={isAdmin ? '/allocation' : '/my-tasks'} className="btn-primary">
            {isAdmin ? 'Run auto-allocation' : 'View my tasks'}
          </Link>
        }
      />

      <DataBoundary
        loading={loading}
        error={error}
        isEmpty={!totals}
        onRetry={refresh}
        empty={<p className="text-slate-500">No data available yet.</p>}
      >
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Active employees"
              value={totals.active_employees}
              sub={`${totals.departments} departments`}
              tone="brand"
              to="/employees"
            />
            <KpiCard
              label="Open tasks"
              value={totals.total_tasks - totals.completed_tasks}
              sub={`${totals.open_estimated_hours}h estimated remaining`}
              to="/tasks"
            />
            <KpiCard
              label="Pending allocation"
              value={totals.pending_tasks}
              sub={totals.pending_tasks > 0 ? 'Waiting for the engine' : 'All work is placed'}
              tone={totals.pending_tasks > 0 ? 'amber' : 'emerald'}
              to="/allocation"
            />
            <KpiCard
              label="Overdue tasks"
              value={totals.overdue_tasks}
              sub={totals.overdue_tasks > 0 ? 'Needs attention' : 'Nothing overdue'}
              tone={totals.overdue_tasks > 0 ? 'red' : 'emerald'}
            />
          </div>

          {/* secondary stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed tasks</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{totals.completed_tasks}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hours logged (30d)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtHours(totals.logged_hours_30d)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Estimation variance
              </p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  Number(totals.hours_variance) > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                {totals.hours_variance > 0 ? '+' : ''}
                {fmtHours(totals.hours_variance)}
              </p>
              <p className="text-xs text-slate-400">estimated vs actual, completed tasks</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg suitability</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
                {totals.avg_suitability ?? '—'}
              </p>
              <p className="text-xs text-slate-400">{totals.auto_allocations} automatic allocations</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* task status distribution */}
            <div className="card lg:col-span-2">
              <div className="card-header">
                <h2 className="font-semibold text-slate-800">Tasks needing attention</h2>
                <Link to="/tasks" className="text-sm font-medium text-brand-700 hover:underline">
                  All tasks
                </Link>
              </div>
              {recentTasks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">
                  No open tasks. Everything has been completed.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentTasks.map((t) => (
                    <li key={t.task_id}>
                      <Link
                        to={`/tasks/${t.task_id}`}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{t.project_name}</span>
                            <span className="text-slate-300">|</span>
                            <span className={t.is_overdue ? 'font-semibold text-red-600' : ''}>
                              {relativeDeadline(t.deadline)}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>{t.assigned_employee_name || 'Unassigned'}</span>
                          </p>
                        </div>
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
                          {fmtHours(t.actual_hours)} / {fmtHours(t.estimated_hours)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* breakdowns */}
            <div className="space-y-6">
              <div className="card">
                <div className="card-header">
                  <h2 className="font-semibold text-slate-800">Tasks by status</h2>
                </div>
                <div className="card-body">
                  <BarList
                    items={byStatus.map((s) => ({
                      label: s.status.replace(/_/g, ' '),
                      count: s.count,
                    }))}
                    total={totalByStatus}
                    colourFor={(label) =>
                      STATUS_COLOURS[label.replace(/ /g, '_').toUpperCase()] || 'bg-slate-400'
                    }
                  />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="font-semibold text-slate-800">Team workload spread</h2>
                </div>
                <div className="card-body">
                  <BarList
                    items={workloadRows.map((w) => ({ label: w.workload_level, count: w.employees }))}
                    total={workloadRows.reduce((s, w) => s + w.employees, 0)}
                    colourFor={(label) =>
                      ({
                        FREE: 'bg-slate-400',
                        LIGHT: 'bg-emerald-500',
                        BALANCED: 'bg-blue-500',
                        HEAVY: 'bg-amber-500',
                        OVERLOADED: 'bg-red-500',
                        INACTIVE: 'bg-slate-300',
                      }[label] || 'bg-slate-400')
                    }
                  />
                  <Link to="/workload" className="mt-4 block text-sm font-medium text-brand-700 hover:underline">
                    Open the workload board
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* skill gaps */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-slate-800">Skill shortages blocking work</h2>
                <Link to="/reports" className="text-sm font-medium text-brand-700 hover:underline">
                  Reports
                </Link>
              </div>
              {skillGaps.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">
                  No skill gaps &mdash; every open task has qualified people available.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {skillGaps.map((s) => (
                    <li key={s.skill_name} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{s.skill_name}</p>
                        <p className="text-xs text-slate-500">
                          {s.qualified_employees} qualified &middot; {s.open_tasks_requiring} open task(s)
                        </p>
                      </div>
                      <span
                        className={`badge ${
                          s.supply_status === 'CRITICAL_GAP'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {s.supply_status.replace('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* top performers */}
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold text-slate-800">Delivery record</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {topPerformers.map((p) => (
                  <li key={p.employee_name} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{p.employee_name}</p>
                      <p className="text-xs text-slate-500">{p.department_name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-slate-800">{p.completed_tasks}</p>
                        <p className="text-[11px] text-slate-400">completed</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                          {p.on_time_completions}
                        </p>
                        <p className="text-[11px] text-slate-400">on time</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums text-red-600">{p.late_completions}</p>
                        <p className="text-[11px] text-slate-400">late</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </DataBoundary>
    </>
  );
}