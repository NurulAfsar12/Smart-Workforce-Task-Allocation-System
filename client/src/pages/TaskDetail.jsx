import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { StatusBadge, PriorityBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtDate, fmtDateTime, relativeDeadline, todayISO, initials, avatarColour } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { tasksApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'skills', label: 'Required skills' },
  { key: 'logs', label: 'Work logs' },
  { key: 'comments', label: 'Comments' },
  { key: 'history', label: 'History' },
];

/** Buttons offered for the current status, mirroring the DB transition rules. */
const NEXT_STATUSES = {
  PENDING: ['ASSIGNED', 'ON_HOLD', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ON_HOLD', 'PENDING'],
  IN_PROGRESS: ['REVIEW', 'ON_HOLD'],
  REVIEW: ['COMPLETED', 'IN_PROGRESS'],
  ON_HOLD: ['PENDING', 'ASSIGNED'],
};

export default function TaskDetail() {
  const { id } = useParams();
  const { isAdmin, employeeId } = useAuth();
  const [tab, setTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const detail = useApi(() => tasksApi.get(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Task" />
        <DataBoundary loading />
      </>
    );
  }
  if (detail.error) {
    return (
      <>
        <PageHeader title="Task" />
        <DataBoundary error={detail.error} onRetry={detail.refresh} />
      </>
    );
  }

  // `detail.data` is the response envelope; the task itself sits under `data`.
  const t = detail.data?.data;
  if (!t) {
    return (
      <>
        <PageHeader title="Task" />
        <DataBoundary isEmpty emptyMessage="This task no longer exists." />
      </>
    );
  }
  // Collection fields are normalised once so a partially populated task can
  // never crash a tab.
  const assignments = t.assignments ?? [];
  const requiredSkills = t.required_skills ?? [];
  const workLogs = t.work_logs ?? [];
  const comments = t.comments ?? [];
  const history = t.history ?? [];

  const transitions = NEXT_STATUSES[t.status] || [];
  const canLogHours =
    Boolean(t.assigned_employee_id) &&
    (isAdmin || t.assigned_employee_id === employeeId);

  async function run(action, successMessage) {
    setBusy(true);
    try {
      await action();
      if (successMessage) setToast({ type: 'success', message: successMessage });
      detail.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <p className="mb-1 text-xs text-slate-500">
            <Link to="/tasks" className="hover:text-brand-700 hover:underline">Tasks</Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span>{t.project_name}</span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span>#{t.task_id}</span>
          </p>
        }
        title={t.title}
        description={t.description}
        actions={
          <>
            {isAdmin && (
              <Link to={`/allocation?task=${t.task_id}`} className="btn-secondary">
                Allocation panel
              </Link>
            )}
            {canLogHours && (
              <button type="button" className="btn-secondary" onClick={() => setLogOpen(true)}>
                Log hours
              </button>
            )}
            {transitions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                className={s === 'COMPLETED' ? 'btn-primary' : 'btn-secondary'}
                onClick={() =>
                  run(() => tasksApi.transition(t.task_id, s), `Task moved to ${s.replace(/_/g, ' ')}`)
                }
              >
                {s === 'COMPLETED' ? 'Mark completed' : s.replace(/_/g, ' ')}
              </button>
            ))}
          </>
        }
      />

      {/* summary strip */}
      <div className="card mb-5 grid grid-cols-2 gap-4 p-5 md:grid-cols-3 xl:grid-cols-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <div className="mt-1.5"><StatusBadge status={t.status} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</p>
          <div className="mt-1.5"><PriorityBadge priority={t.priority} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deadline</p>
          <p className="mt-1.5 text-sm font-medium text-slate-800">{fmtDate(t.deadline)}</p>
          <p className={`text-xs ${t.is_overdue ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
            {relativeDeadline(t.deadline)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
          {t.assigned_employee_id ? (
            <Link to={`/employees/${t.assigned_employee_id}`} className="mt-1.5 flex items-center gap-2 hover:underline">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${avatarColour(t.assigned_employee_name)}`}>
                {initials(t.assigned_employee_name)}
              </span>
              <span className="truncate text-sm font-medium text-slate-800">{t.assigned_employee_name}</span>
            </Link>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">Unassigned</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Effort</p>
          <p className="mt-1.5 text-sm font-medium tabular-nums text-slate-800">
            {fmtHours(t.actual_hours)} <span className="text-slate-400">/ {fmtHours(t.estimated_hours)}</span>
          </p>
          <p className={`text-xs tabular-nums ${
            Number(t.hours_variance) > 0 ? 'text-red-500' : 'text-emerald-600'
          }`}>
            {Number(t.hours_variance) > 0 ? '+' : ''}{fmtHours(t.hours_variance)} variance
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
          <div className="mt-2 flex items-center gap-2">
            <UtilisationBar percent={t.progress_percent} showLabel={false} className="flex-1" />
            <span className="text-sm font-semibold tabular-nums text-slate-700">{Math.round(Number(t.progress_percent))}%</span>
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="card">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-3">
          {TABS.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setTab(x.key)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === x.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {x.label}
              {x.key === 'comments' && comments.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {comments.length}
                </span>
              )}
              {x.key === 'logs' && workLogs.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {workLogs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid gap-6 p-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Description</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {t.description || <span className="text-slate-400">No description provided.</span>}
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Timeline</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  {[
                    ['Created', t.created_at],
                    ['Assigned', t.assigned_at],
                    ['Started', t.started_at],
                    ['Completed', t.completed_at],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-400">{label}</dt>
                      <dd className="text-slate-700">{fmtDateTime(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">Assignment history</h3>
                {assignments.length === 0 ? (
                  <p className="text-sm text-slate-400">Never allocated.</p>
                ) : (
                  <ul className="space-y-3">
                    {assignments.map((a) => (
                      <li key={a.assignment_id} className="border-l-2 border-slate-200 pl-3">
                        <p className="text-sm font-medium text-slate-800">{a.employee_name}</p>
                        <p className="text-xs text-slate-500">
                          {a.mode === 'AUTO' ? 'Automatic' : 'Manual'} &middot; {fmtDateTime(a.assigned_at)}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs">
                          {a.state === 'ACTIVE' ? (
                            <span className="text-emerald-600">Active</span>
                          ) : (
                            <span className="text-slate-400">{a.state}</span>
                          )}
                          {a.suitability_score !== null && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold tabular-nums text-slate-600">
                              score {Number(a.suitability_score)}
                            </span>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Project</h3>
                <p className="text-sm font-medium text-slate-800">{t.project_name}</p>
                <p className="text-xs text-slate-500">Code {t.project_code}</p>
              </section>
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="p-5">
            {requiredSkills.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                No required skills defined. Anyone with free capacity can be allocated.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>Category</th>
                      <th className="text-center">Required level</th>
                      <th>Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requiredSkills.map((s) => (
                      <tr key={s.skill_id}>
                        <td className="font-medium text-slate-800">{s.skill_name}</td>
                        <td className="text-slate-600">{s.category}</td>
                        <td className="text-center">
                          <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                            L{s.required_level}
                          </span>
                        </td>
                        <td>
                          {s.is_mandatory ? (
                            <span className="badge bg-red-100 text-red-700">Mandatory</span>
                          ) : (
                            <span className="badge bg-slate-100 text-slate-600">Preferred</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Mandatory skills are hard filters in <code className="font-mono">fn_task_candidates()</code>;
              preferred skills only influence the score. An employee needs at least 50% coverage.
            </p>
          </div>
        )}

        {tab === 'logs' && (
          <WorkLogsTab
            task={t}
            canLog={canLogHours}
            onAdd={() => setLogOpen(true)}
            onChanged={detail.refresh}
          />
        )}

        {tab === 'comments' && (
          <CommentsTab task={t} onChanged={detail.refresh} />
        )}

        {tab === 'history' && (
          <div className="p-5">
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No recorded changes.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {history.map((h) => (
                  <li key={h.history_id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
                    <p className="text-sm font-medium capitalize text-slate-800">
                      {String(h.action || 'change').replace(/_/g, ' ')}
                      {h.from_status && h.to_status && (
                        <span className="font-normal text-slate-600">
                          {' '}from{' '}
                          <code className="rounded bg-slate-100 px-1 font-mono text-xs">{String(h.from_status).replace(/_/g, ' ')}</code>
                          {' '}to{' '}
                          <code className="rounded bg-brand-50 px-1 font-mono text-xs text-brand-700">{String(h.to_status).replace(/_/g, ' ')}</code>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {h.changed_by_name || h.changed_by_employee || 'System'} &middot; {fmtDateTime(h.changed_at)}
                      {h.remarks && <span> &middot; {h.remarks}</span>}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      <LogHoursModal
        open={logOpen}
        task={t}
        onClose={() => setLogOpen(false)}
        onLogged={(message) => {
          setLogOpen(false);
          setToast({ type: 'success', message });
          detail.refresh();
        }}
        onError={(message) => setToast({ type: 'error', message })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function WorkLogsTab({ task, canLog, onAdd, onChanged }) {
  const total = task.work_logs.reduce((sum, l) => sum + Number(l.hours_spent), 0);
  const [pending, setPending] = useState(false);

  async function remove(logId) {
    if (!window.confirm('Delete this work log?')) return;
    setPending(true);
    try {
      await tasksApi.deleteLog(task.task_id, logId);
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">
            <span className="font-semibold tabular-nums text-slate-800">{fmtHours(total)}</span> logged of{' '}
            <span className="tabular-nums">{fmtHours(task.estimated_hours)}</span> estimated
          </p>
          <p className="text-xs text-slate-400">
            The trigger rejects logs from anyone other than the current assignee.
          </p>
        </div>
        {canLog && (
          <button type="button" className="btn-secondary btn-sm" onClick={onAdd}>
            + Log hours
          </button>
        )}
      </div>

      {task.work_logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No hours logged yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Hours</th>
                <th>Work description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {task.work_logs.map((l) => (
                <tr key={l.work_log_id}>
                  <td className="whitespace-nowrap text-slate-700">{fmtDate(l.log_date)}</td>
                  <td className="text-right font-semibold tabular-nums text-slate-800">
                    {fmtHours(l.hours_spent)}
                  </td>
                  <td className="text-slate-600">{l.work_description || '—'}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(l.work_log_id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CommentsTab({ task, onChanged }) {
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      await tasksApi.addComment(task.task_id, { body });
      setBody('');
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="p-5">
      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input
          className="input"
          placeholder="Write a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={pending || !body.trim()}>
          {pending ? <Spinner /> : null} Post
        </button>
      </form>

      {task.comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {task.comments.map((c) => (
            <li key={c.comment_id} className="flex gap-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColour(c.full_name || '')}`}>
                {initials(c.full_name || '?')}
              </span>
              <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-4 py-2.5">
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{c.full_name || 'System'}</span>
                  {c.role === 'ADMIN' && <span className="badge bg-brand-50 text-brand-700">Admin</span>}
                  <span>{fmtDateTime(c.created_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LogHoursModal({ open, task, onClose, onLogged, onError }) {
  const [form, setForm] = useState({ log_date: todayISO(), hours_spent: '', work_description: '' });
  const [pending, setPending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await tasksApi.addLog(task.task_id, {
        ...form,
        hours_spent: Number(form.hours_spent),
        employee_id: task.assigned_employee_id,
      });
      const after = res.task_hours;
      setForm({ log_date: todayISO(), hours_spent: '', work_description: '' });
      onLogged(
        `${res.message}. Task effort is now ${after.actual_hours}h of ${after.estimated_hours}h.`
      );
    } catch (err) {
      onError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log working hours"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="log-hours-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="log-hours-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Logging for <strong>{task.assigned_employee_name || 'nobody'}</strong>. The database only
          accepts hours from the employee currently holding the task, and
          <code className="mx-1 font-mono">tasks.actual_hours</code> is recalculated automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="log-date">Date</label>
            <input
              id="log-date"
              className="input"
              type="date"
              max={todayISO()}
              value={form.log_date}
              onChange={(e) => setForm((f) => ({ ...f, log_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="log-hours">Hours *</label>
            <input
              id="log-hours"
              className="input"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              required
              value={form.hours_spent}
              onChange={(e) => setForm((f) => ({ ...f, hours_spent: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="log-desc">What did you work on?</label>
          <textarea
            id="log-desc"
            className="input"
            rows={3}
            value={form.work_description}
            onChange={(e) => setForm((f) => ({ ...f, work_description: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}