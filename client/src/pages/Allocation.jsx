import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { PriorityBadge } from '../lib/badges';
import { fmtHours, relativeDeadline, initials, avatarColour } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { allocationApi, tasksApi, projectsApi } from '../api/client';

export default function Allocation() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('task');
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const pendingTasks = useApi(() => allocationApi.pending(), []);
  const projects = useApi(() => projectsApi.list(), []);

  const pendingList = pendingTasks.data?.data ?? [];

  // Opening ?task=N (for example from a task page) selects it straight away.
  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    allocationApi
      .preview(selectedId)
      .then((res) => !cancelled && setPreview(res))
      .catch((err) => setToast({ type: 'error', message: err.message }))
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function runBatch(projectId) {
    setPending(true);
    try {
      const res = await allocationApi.run(projectId);
      setToast({ type: 'success', message: res.message });
      pendingTasks.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  async function allocateTask(taskId) {
    setPending(true);
    try {
      const res = await tasksApi.allocate(taskId);
      setToast({ type: 'success', message: res.message });
      setConfirm(null);
      pendingTasks.refresh();
      if (selectedId === String(taskId)) setPreview(null);
    } catch (err) {
      setToast({
        type: 'error',
        message: err.status === 409 ? `No eligible employee — ${err.reason || err.message}` : err.message,
      });
      setConfirm(null);
    } finally {
      setPending(false);
    }
  }

  async function assignManually(taskId, employeeId) {
    setPending(true);
    try {
      const res = await tasksApi.assign(taskId, employeeId);
      setToast({ type: 'success', message: res.message });
      setConfirm(null);
      pendingTasks.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  const select = (taskId) => {
    if (taskId === selectedId) setParams({});
    else setParams({ task: String(taskId) });
  };

  return (
    <>
      <PageHeader
        title="Allocation engine"
        description="Every decision below is made by fn_allocate_task() inside PostgreSQL. Scores are 0-100 and weighted: skill 45%, capacity 25%, availability 15%, deadline 10%, experience 5%."
        actions={
          <>
            <select
              className="input w-auto"
              defaultValue=""
              onChange={(e) => e.target.value && runBatch(Number(e.target.value))}
              disabled={pending}
            >
              <option value="">All projects</option>
              {projects.data?.data?.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => runBatch(null)}>
              {pending ? <Spinner /> : null} Run on all pending tasks
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* pending pool */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-800">Pending pool</h2>
              <span className="badge bg-slate-100 text-slate-700">{pendingList.length}</span>
            </div>

            <DataBoundary
              loading={pendingTasks.loading}
              error={pendingTasks.error}
              onRetry={pendingTasks.refresh}
              isEmpty={pendingList.length === 0}
              emptyTitle="Nothing waiting"
              emptyMessage="Every task has an owner. New tasks appear here automatically."
            >
              <ul className="divide-y divide-slate-100">
                {pendingList.map((t) => (
                  <li key={t.task_id}>
                    <button
                      type="button"
                      onClick={() => select(t.task_id)}
                      className={`w-full px-5 py-3 text-left transition-colors hover:bg-slate-50 ${
                        selectedId === String(t.task_id) ? 'bg-brand-50/70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-slate-800">{t.title}</p>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="truncate">{t.project_name}</span>
                        <span className="text-slate-300">|</span>
                        <span>{fmtHours(t.estimated_hours)}</span>
                        <span className="text-slate-300">|</span>
                        <span className={t.deadline ? 'text-slate-600' : 'text-slate-400'}>
                          {relativeDeadline(t.deadline)}
                        </span>
                      </p>
                      {t.required_skills_text && (
                        <p className="mt-1 truncate text-xs text-brand-700">{t.required_skills_text}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </DataBoundary>
          </div>
        </div>

        {/* candidate ranking */}
        <div className="lg:col-span-3">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-slate-800">
                {preview ? `Candidates for “${preview.task.title}”` : 'Candidate ranking'}
              </h2>
              {preview && (
                <Link to={`/tasks/${preview.task.task_id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  Open task
                </Link>
              )}
            </div>

            {previewLoading && (
              <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
                <Spinner className="h-5 w-5" /> Scoring candidates...
              </div>
            )}

            {!previewLoading && !preview && (
              <p className="py-20 text-center text-sm text-slate-400">
                Select a task from the pending pool to see how every employee scores.
              </p>
            )}

            {preview && !previewLoading && (
              <div className="space-y-5 p-5">
                {/* plain english summary */}
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <p className="text-sm font-semibold text-brand-900">{preview.explanation.headline}</p>
                  {preview.explanation.reasons.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {preview.explanation.reasons.map((r) => (
                        <li key={r} className="flex gap-2 text-xs text-brand-800">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.explanation.chosen && (
                    <div className="mt-4 border-t border-brand-200 pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                        Score composition
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(preview.explanation.score_breakdown).map(([k, v]) => (
                          <div key={k} className="rounded bg-white/70 px-3 py-2">
                            <p className="text-[11px] capitalize text-slate-500">{k}</p>
                            <p className="text-lg font-bold tabular-nums text-brand-800">{Math.round(Number(v))}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    className="btn-primary mt-4"
                    onClick={() => setConfirm({ taskId: preview.task.task_id, mode: 'auto' })}
                  >
                    {pending ? <Spinner /> : null} Allocate to the best candidate
                  </button>
                </div>

                {/* full table */}
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th className="text-right">Score</th>
                        <th className="text-right">Skills</th>
                        <th className="text-right">Load after</th>
                        <th>Eligible</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {preview.candidates.map((c) => {
                        const isTop = c.is_eligible && c.total_score === preview.candidates.find((x) => x.is_eligible)?.total_score;
                        return (
                          <tr key={c.employee_id} className={isTop ? 'bg-emerald-50/60' : !c.is_eligible ? 'opacity-70' : ''}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColour(c.employee_name)}`}>
                                  {initials(c.employee_name)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800">
                                    {c.employee_name}
                                    {isTop && <span className="ml-2 badge bg-emerald-100 text-emerald-700">Best</span>}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">{c.job_title} · {c.department_name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right">
                              <span className={`text-sm font-bold tabular-nums ${
                                c.is_eligible ? 'text-slate-800' : 'text-slate-400'
                              }`}>
                                {Number(c.total_score)}
                              </span>
                            </td>
                            <td className="text-right tabular-nums text-slate-600">
                              {c.matched_skills}/{c.required_skills}
                            </td>
                            <td className="whitespace-nowrap text-right tabular-nums text-slate-600">
                              {fmtHours(Number(c.allocated_hours) + Number(preview.task.estimated_hours))}
                              <span className="text-slate-400"> / {fmtHours(c.capacity_hours)}</span>
                            </td>
                            <td>
                              {c.is_eligible ? (
                                <span className="badge bg-emerald-100 text-emerald-700">Yes</span>
                              ) : (
                                <span
                                  className="badge cursor-help bg-red-100 text-red-700"
                                  title={(c.blocking_reasons || []).join(' · ')}
                                >
                                  No
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              <button
                                type="button"
                                disabled={pending}
                                className="btn-secondary btn-sm"
                                onClick={() =>
                                  setConfirm({
                                    taskId: preview.task.task_id,
                                    mode: 'manual',
                                    employeeId: c.employee_id,
                                    name: c.employee_name,
                                    eligible: c.is_eligible,
                                  })
                                }
                              >
                                Assign
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-500">
                  Hover the “No” badge to see which rule blocked a candidate. Assigning an ineligible
                  employee requires a force override inside the database function.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* confirmation */}
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.mode === 'auto' ? 'Confirm automatic allocation' : 'Confirm manual assignment'}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                confirm.mode === 'auto'
                  ? allocateTask(confirm.taskId)
                  : assignManually(confirm.taskId, confirm.employeeId)
              }
            >
              {pending ? <Spinner /> : null} Confirm
            </button>
          </>
        }
      >
        {confirm?.mode === 'auto' ? (
          <p className="text-sm text-slate-600">
            The highest scoring eligible employee will be assigned. The task is locked during
            allocation so two concurrent runs cannot pick the same person.
          </p>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Assign this task to <strong>{confirm?.name}</strong>?
            </p>
            {!confirm?.eligible && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This employee is not eligible. The database will reject the assignment unless the
                rules are forced.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}