import { Link } from 'react-router-dom';
import { PageHeader, DataBoundary } from '../components/layout';
import { StatusBadge, PriorityBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtDate, relativeDeadline } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { tasksApi, workloadApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const OPEN_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'ON_HOLD'];

export default function MyTasks() {
  const { user, employeeId } = useAuth();

  // Filter by the employee id explicitly: the `my_tasks` shortcut is only
  // applied by the API for non-admin roles, which would show an admin
  // everybody else's work.
  const tasks = useApi(
    () => (employeeId ? tasksApi.list({ assigned_employee_id: employeeId }) : Promise.resolve([])),
    [employeeId]
  );
  const workload = useApi(() => (employeeId ? workloadApi.employee(employeeId) : null), [employeeId]);

  const open = (tasks.data || []).filter((t) => OPEN_STATUSES.includes(t.status));
  const done = (tasks.data || []).filter((t) => t.status === 'COMPLETED');
  const w = workload.data;

  return (
    <>
      <PageHeader
        title={`My work — ${user?.full_name || ''}`}
        description="Only tasks assigned to you. Log hours from the task page; the database rejects logs from anyone else."
      />

      {employeeId ? (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Weekly capacity</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtHours(w?.capacity_hours)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allocated</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">{fmtHours(w?.allocated_hours)}</p>
            <div className="mt-2"><UtilisationBar percent={w?.utilization_pct} showLabel={false} /></div>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open tasks</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{open.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{done.length}</p>
          </div>
        </div>
      ) : (
        <div className="card mb-5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This account is not linked to an employee record, so it has no personal task list. Use the
          Tasks and Workload screens instead.
        </div>
      )}

      <div className="card">
        {!employeeId ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            This account is not linked to an employee record, so it has no personal task list.
          </p>
        ) : (
          <DataBoundary
            loading={tasks.loading}
            error={tasks.error}
            onRetry={tasks.refresh}
            isEmpty={(tasks.data?.length ?? 0) === 0}
            emptyTitle="Nothing assigned to you"
            emptyMessage="When the allocation engine picks you for a task it will show up here."
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Project</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th className="text-right">Effort</th>
                    <th className="text-right">Progress</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {(tasks.data || []).map((t) => (
                    <tr key={t.task_id}>
                      <td className="max-w-[280px]">
                        <Link to={`/tasks/${t.task_id}`} className="block truncate font-medium text-slate-800 hover:text-brand-700">
                          {t.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap text-slate-600">{t.project_name}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td className="whitespace-nowrap text-right tabular-nums text-slate-600">
                        {fmtHours(t.actual_hours)} / {fmtHours(t.estimated_hours)}
                      </td>
                      <td className="w-32">
                        <div className="flex items-center gap-2">
                          <UtilisationBar percent={t.progress_percent} showLabel={false} className="flex-1" />
                          <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                            {Math.round(Number(t.progress_percent))}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={t.is_overdue ? 'font-semibold text-red-600' : 'text-slate-600'}>
                          {fmtDate(t.deadline)}
                        </span>
                        <span className="block text-xs text-slate-400">{relativeDeadline(t.deadline)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataBoundary>
        )}
      </div>
    </>
  );
}