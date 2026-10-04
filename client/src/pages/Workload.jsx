import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, DataBoundary } from '../components/layout';
import { WorkloadBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, initials, avatarColour } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { workloadApi, departmentsApi } from '../api/client';

const LEVELS = ['', 'OVERLOADED', 'HEAVY', 'BALANCED', 'LIGHT', 'FREE', 'INACTIVE'];

/** Colour intensity for the deadline heatmap cells. */
function heatTone(hours) {
  if (!hours) return 'bg-slate-100 text-slate-400';
  if (hours <= 6) return 'bg-emerald-100 text-emerald-800';
  if (hours <= 14) return 'bg-amber-100 text-amber-800';
  if (hours <= 24) return 'bg-orange-200 text-orange-900';
  return 'bg-red-200 text-red-900';
}

export default function Workload() {
  const [filters, setFilters] = useState({ department_id: '', workload_level: '' });
  const [view, setView] = useState('people');

  const workload = useApi(
    () => workloadApi.list({
      department_id: filters.department_id,
      workload_level: filters.workload_level,
    }),
    [filters.department_id, filters.workload_level]
  );

  const heatmap = useApi(() => workloadApi.heatmap(28), []);
  const departments = useApi(() => departmentsApi.list(), []);

  const rows = workload.data?.data ?? [];
  const daily = heatmap.data?.daily ?? [];
  const heatDepartments = heatmap.data?.departments ?? [];

  const s = workload.data?.summary;

  return (
    <>
      <PageHeader
        title="Workload"
        description="Utilisation is calculated in hours against weekly capacity, not by counting tasks. Two people with two tasks each can be completely differently loaded."
        actions={
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
            {['people', 'pressure'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {v === 'people' ? 'By person' : 'Deadline pressure'}
              </button>
            ))}
          </div>
        }
      />

      {view === 'people' && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              ['Total capacity', `${s?.total_capacity_hours ?? 0}h`, 'text-slate-900'],
              ['Allocated', `${s?.total_allocated_hours ?? 0}h`, 'text-brand-700'],
              ['Remaining', `${s?.total_remaining_hours ?? 0}h`, 'text-emerald-600'],
              ['Overall utilisation', `${s?.overall_utilization_pct ?? 0}%`, 'text-slate-900'],
              ['Open / overdue tasks', `${s?.open_tasks ?? 0} / ${s?.overdue_tasks ?? 0}`, 'text-amber-600'],
            ].map(([label, value, tone]) => (
              <div key={label} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
            <div className="w-56">
              <label className="label">Department</label>
              <select
                className="input"
                value={filters.department_id}
                onChange={(e) => setFilters((f) => ({ ...f, department_id: e.target.value }))}
              >
                <option value="">All departments</option>
                {departments.data?.data?.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="w-52">
              <label className="label">Workload band</label>
              <select
                className="input"
                value={filters.workload_level}
                onChange={(e) => setFilters((f) => ({ ...f, workload_level: e.target.value }))}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l ? l.toLowerCase() : 'All bands'}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <DataBoundary
              loading={workload.loading}
              error={workload.error}
              onRetry={workload.refresh}
              isEmpty={rows.length === 0}
              emptyTitle="No employees match"
              emptyMessage="Adjust the department or workload filter."
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Band</th>
                      <th className="w-52">Utilisation</th>
                      <th className="text-right">Allocated</th>
                      <th className="text-right">Free</th>
                      <th className="text-right">Open</th>
                      <th className="text-right">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((w) => (
                      <tr key={w.employee_id}>
                        <td>
                          <Link to={`/employees/${w.employee_id}`} className="flex items-center gap-2 hover:underline">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${avatarColour(w.employee_name)}`}>
                              {initials(w.employee_name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-800">{w.employee_name}</span>
                              <span className="block truncate text-xs text-slate-500">{w.job_title}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="whitespace-nowrap text-slate-600">{w.department_name}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <WorkloadBadge level={w.workload_level} />
                            {w.on_leave_today && <span className="badge bg-amber-100 text-amber-800">On leave</span>}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <UtilisationBar percent={w.utilization_pct} showLabel={false} className="flex-1" />
                            <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-600">
                              {Number(w.utilization_pct)}%
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums text-slate-700">
                          {fmtHours(w.allocated_hours)}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums text-emerald-600">
                          {fmtHours(w.remaining_hours)}
                        </td>
                        <td className="text-right tabular-nums text-slate-600">{w.open_tasks}</td>
                        <td className="text-right tabular-nums">
                          <span className={Number(w.overdue_tasks) > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>
                            {w.overdue_tasks}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataBoundary>
          </div>
        </>
      )}

      {view === 'pressure' && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-800">Hours due in the next 28 days</h2>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100" /> ≤ 6h</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> ≤ 14h</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-200" /> ≤ 24h</span>
                <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-200" /> more</span>
              </div>
            </div>
            <div className="card-body">
              <DataBoundary loading={heatmap.loading} error={heatmap.error} onRetry={heatmap.refresh}>
                <div className="flex flex-wrap gap-1.5">
                  {daily.map((d) => (
                    <div
                      key={d.day}
                      className={`w-[calc(14.285%-0.375rem)] min-w-[3.25rem] flex-1 rounded p-1.5 text-center ${heatTone(Number(d.hours_due))}`}
                      title={`${d.day}: ${d.hours_due}h across ${d.tasks_due} task(s)`}
                    >
                      <p className="text-[10px] font-medium uppercase opacity-70">
                        {new Date(d.day).toLocaleDateString('en-GB', { weekday: 'narrow' })}
                      </p>
                      <p className="text-sm font-bold tabular-nums">{d.hours_due}</p>
                      {Number(d.critical_tasks) > 0 && (
                        <p className="text-[9px] font-bold">{d.critical_tasks} crit</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  A day with more hours due than a team can absorb is where deadlines start slipping.
                  Days with unallocated hours shown in the title mean work has no owner yet.
                </p>
              </DataBoundary>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-800">Load by department</h2>
            </div>
            <DataBoundary loading={heatmap.loading} error={heatmap.error} onRetry={heatmap.refresh}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th className="text-right">Allocated hours</th>
                      <th className="text-right">Completed hours</th>
                      <th className="text-right">Open tasks</th>
                      <th className="text-right">Total tasks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatDepartments.map((d) => (
                      <tr key={d.department_name}>
                        <td className="font-medium text-slate-800">{d.department_name}</td>
                        <td className="text-right tabular-nums text-slate-700">{fmtHours(d.allocated_hours)}</td>
                        <td className="text-right tabular-nums text-slate-600">{fmtHours(d.completed_hours)}</td>
                        <td className="text-right tabular-nums text-slate-700">{d.open_tasks}</td>
                        <td className="text-right tabular-nums text-slate-500">{d.total_tasks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataBoundary>
          </div>
        </div>
      )}
    </>
  );
}