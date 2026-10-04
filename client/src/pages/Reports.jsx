import { useState } from 'react';
import { PageHeader, DataBoundary } from '../components/layout';
import { RiskBadge, SupplyBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtDate, fmtShortDate } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { reportsApi } from '../api/client';

const SECTIONS = [
  { key: 'skills', label: 'Skill demand vs supply', description: 'Where demand exists but nobody qualified can take the work.' },
  { key: 'deadlines', label: 'Deadline risk', description: 'Open tasks ranked by how likely they are to slip.' },
  { key: 'projects', label: 'Project progress', description: 'Effort consumed against estimate per project.' },
  { key: 'performance', label: 'Performance', description: 'Completed work, on-time rate and estimation accuracy.' },
  { key: 'allocation', label: 'Allocation log', description: 'Every automatic and manual assignment with its score.' },
  { key: 'effort', label: 'Logged effort', description: 'Hours logged per day and per employee.' },
];

export default function Reports() {
  const [section, setSection] = useState('skills');
  const [mode, setMode] = useState('');

  return (
    <>
      <PageHeader
        title="Reports"
        description="All of these read from database views, so the numbers are computed by SQL rather than by the application."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              section === s.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-slate-500">
        {SECTIONS.find((s) => s.key === section)?.description}
      </p>

      {section === 'skills' && <SkillsReport />}
      {section === 'deadlines' && <DeadlineReport />}
      {section === 'projects' && <ProjectsReport />}
      {section === 'performance' && <PerformanceReport />}
      {section === 'allocation' && <AllocationReport mode={mode} setMode={setMode} />}
      {section === 'effort' && <EffortReport />}
    </>
  );
}

function SkillsReport() {
  const { data, loading, error, refresh } = useApi(() => reportsApi.skills(), []);
  const rows = data?.data || [];

  return (
    <div className="card">
      <DataBoundary loading={loading} error={error} onRetry={refresh} isEmpty={rows.length === 0}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Category</th>
                <th className="text-center">Qualified</th>
                <th className="text-center">Avg level</th>
                <th className="text-right">Open tasks</th>
                <th className="text-right">Open hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.skill_id}>
                  <td className="font-medium text-slate-800">{s.skill_name}</td>
                  <td className="text-slate-600">{String(s.category).replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="text-center tabular-nums text-slate-700">{s.qualified_employees}</td>
                  <td className="text-center tabular-nums text-slate-600">{Number(s.avg_proficiency).toFixed(1)}</td>
                  <td className="text-right tabular-nums text-slate-700">{s.open_tasks_requiring}</td>
                  <td className="text-right tabular-nums text-slate-600">{fmtHours(s.open_hours_required)}</td>
                  <td><SupplyBadge status={s.supply_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataBoundary>
    </div>
  );
}

function DeadlineReport() {
  const { data, loading, error, refresh } = useApi(() => reportsApi.deadlineRisk(), []);
  const summary = data?.summary || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {['OVERDUE', 'CRITICAL', 'AT_RISK', 'ON_TRACK'].map((k) => (
          <div key={k} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.replace(/_/g, ' ')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{summary[k] || 0}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <DataBoundary loading={loading} error={error} onRetry={refresh}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assignee</th>
                  <th className="text-right">Estimated</th>
                  <th className="text-right">Logged</th>
                  <th className="text-center">Days left</th>
                  <th>Deadline</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((t) => (
                  <tr key={t.task_id}>
                    <td className="max-w-[260px]">
                      <p className="truncate font-medium text-slate-800">{t.title}</p>
                      <p className="truncate text-xs text-slate-500">{t.project_name}</p>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{t.assigned_employee_name || '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{fmtHours(t.estimated_hours)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-700">{fmtHours(t.actual_hours)}</td>
                    <td className="text-center tabular-nums">
                      <span className={Number(t.days_left) < 0 ? 'font-semibold text-red-600' : 'text-slate-600'}>
                        {t.days_left == null ? '—' : t.days_left}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{fmtShortDate(t.deadline)}</td>
                    <td><RiskBadge risk={t.risk_level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataBoundary>
      </div>
    </div>
  );
}

function ProjectsReport() {
  const { data, loading, error, refresh } = useApi(() => reportsApi.projects(), []);

  return (
    <div className="card">
      <DataBoundary loading={loading} error={error} onRetry={refresh} isEmpty={data?.length === 0}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Department</th>
                <th>Status</th>
                <th className="text-center">Tasks</th>
                <th className="text-right">Estimated</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Variance</th>
                <th className="w-40">Completion</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => {
                const variance = Number(p.actual_hours) - Number(p.estimated_hours);
                return (
                  <tr key={p.project_id}>
                    <td>
                      <p className="font-medium text-slate-800">{p.project_name}</p>
                      <p className="font-mono text-[11px] uppercase text-brand-700">{p.code}</p>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{p.department_name}</td>
                    <td className="whitespace-nowrap text-slate-600">{String(p.project_status).replace(/_/g, ' ')}</td>
                    <td className="text-center tabular-nums text-slate-700">
                      {p.completed_tasks}/{p.total_tasks}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{fmtHours(p.estimated_hours)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-700">{fmtHours(p.actual_hours)}</td>
                    <td className={`whitespace-nowrap text-right tabular-nums ${
                      variance > 0 ? 'font-semibold text-red-600' : 'text-emerald-600'
                    }`}>
                      {variance > 0 ? '+' : ''}{fmtHours(variance)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <UtilisationBar percent={p.completion_pct} showLabel={false} className="flex-1" />
                        <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                          {Math.round(Number(p.completion_pct))}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataBoundary>
    </div>
  );
}

function PerformanceReport() {
  const { data, loading, error, refresh } = useApi(() => reportsApi.performance(), []);

  return (
    <div className="card">
      <DataBoundary loading={loading} error={error} onRetry={refresh} isEmpty={data?.length === 0}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th className="text-center">Completed</th>
                <th className="text-center">On time</th>
                <th className="text-center">Late</th>
                <th className="text-right">Estimated</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Est. accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => {
                const accuracy = Number(p.estimated_hours) > 0
                  ? (Number(p.actual_hours) / Number(p.estimated_hours)) * 100
                  : null;
                return (
                  <tr key={p.employee_id}>
                    <td className="font-medium text-slate-800">{p.employee_name}</td>
                    <td className="whitespace-nowrap text-slate-600">{p.department_name}</td>
                    <td className="text-center tabular-nums text-slate-800">{p.completed_tasks}</td>
                    <td className="text-center tabular-nums text-emerald-600">{p.on_time_completions}</td>
                    <td className="text-center tabular-nums text-red-600">{p.late_completions}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">{fmtHours(p.estimated_hours)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-700">{fmtHours(p.actual_hours)}</td>
                    <td className="whitespace-nowrap text-right">
                      {accuracy === null ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className={`text-sm font-semibold tabular-nums ${
                          accuracy <= 110 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {Math.round(accuracy)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Estimation accuracy is actual hours divided by estimated hours for completed work. Anything
          above 110% means the original estimate was too low.
        </p>
      </DataBoundary>
    </div>
  );
}

function AllocationReport({ mode, setMode }) {
  const { data, loading, error, refresh } = useApi(() => reportsApi.allocationLog({ mode, limit: 300 }), [mode]);

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="font-semibold text-slate-800">Allocation log</h2>
        <select
          className="input w-40"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="">All modes</option>
          <option value="AUTO">Automatic</option>
          <option value="MANUAL">Manual</option>
        </select>
      </div>
      <DataBoundary loading={loading} error={error} onRetry={refresh} isEmpty={data?.length === 0}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Employee</th>
                <th>Mode</th>
                <th>State</th>
                <th className="text-right">Score</th>
                <th className="text-right">Eligible</th>
                <th>When</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((a) => (
                <tr key={a.assignment_id}>
                  <td className="max-w-[240px]">
                    <p className="truncate font-medium text-slate-800">{a.task_title}</p>
                    <p className="truncate text-xs text-slate-500">{a.project_name}</p>
                  </td>
                  <td className="whitespace-nowrap text-slate-700">{a.employee_name}</td>
                  <td>
                    <span className={`badge ${a.mode === 'AUTO' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                      {a.mode}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${a.state === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : a.state === 'REVOKED' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                      {a.state}
                    </span>
                  </td>
                  <td className="text-right font-semibold tabular-nums text-slate-800">
                    {a.suitability_score != null ? Number(a.suitability_score) : '—'}
                  </td>
                  <td className="text-right tabular-nums text-slate-600">{a.eligible_candidates ?? '—'}</td>
                  <td className="whitespace-nowrap text-slate-600">{fmtDate(a.assigned_at)}</td>
                  <td className="whitespace-nowrap text-slate-500">{a.assigned_by_name || 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataBoundary>
    </div>
  );
}

function EffortReport() {
  const [days, setDays] = useState('30');
  const { data, loading, error, refresh } = useApi(() => reportsApi.effort(Number(days)), [days]);
  const byDay = data?.by_day || [];
  const byEmployee = data?.by_employee || [];

  const max = Math.max(1, ...byDay.map((d) => Number(d.hours_spent)));
  const total = byDay.reduce((sum, d) => sum + Number(d.hours_spent), 0);

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {fmtHours(total)} logged over {byDay.length} day{byDay.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-slate-500">Only hours recorded in work_logs count as actual effort.</p>
        </div>
        <select className="input w-40" value={days} onChange={(e) => setDays(e.target.value)}>
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      <div className="card p-5">
        <DataBoundary loading={loading} error={error} onRetry={refresh}>
          {byDay.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No hours logged in this period.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {byDay.map((d) => (
                <div key={d.log_date} className="group relative flex-1" title={`${d.log_date}: ${d.hours_spent}h`}>
                  <div
                    className="w-full rounded-t bg-brand-400 transition-colors group-hover:bg-brand-600"
                    style={{ height: `${(Number(d.hours_spent) / max) * 150}px` }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{byDay[0]?.log_date}</span>
            <span>{byDay[byDay.length - 1]?.log_date}</span>
          </div>
        </DataBoundary>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-slate-800">Effort by employee and day</h2>
        </div>
        <DataBoundary loading={loading} error={error} onRetry={refresh} isEmpty={byEmployee.length === 0}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th className="text-center">Tasks touched</th>
                  <th className="text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((l) => (
                  <tr key={`${l.employee_id}-${l.log_date}`}>
                    <td className="whitespace-nowrap text-slate-700">{l.employee_name}</td>
                    <td className="whitespace-nowrap text-slate-500">{l.department_name}</td>
                    <td className="whitespace-nowrap text-slate-600">{fmtDate(l.log_date)}</td>
                    <td className="text-center tabular-nums text-slate-600">{l.tasks_touched}</td>
                    <td className="text-right font-semibold tabular-nums text-slate-800">{fmtHours(l.hours_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataBoundary>
      </div>
    </div>
  );
}