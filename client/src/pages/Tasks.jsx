import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner } from '../components/layout';
import { Toast } from '../components/ui';
import { StatusBadge, PriorityBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtShortDate, relativeDeadline, todayISO } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { tasksApi, projectsApi, skillsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = ['', 'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'ON_HOLD', 'CANCELLED'];
const PRIORITY_OPTIONS = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const EMPTY_FORM = {
  project_id: '',
  title: '',
  description: '',
  priority: 'MEDIUM',
  estimated_hours: '',
  deadline: '',
  auto_allocate: true,
};

export default function Tasks() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', priority: '', search: '', overdue: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const { data, loading, error, refresh } = useApi(
    () => tasksApi.list(filters),
    [filters.status, filters.priority, filters.search, filters.overdue]
  );

  // `data` is null until the request resolves; JSX children are evaluated
  // eagerly, so the table always iterates a real array.
  const tasks = data?.data ?? [];

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every task with its required skills, assignee, effort and deadline state."
        actions={
          isAdmin && (
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              + New task
            </button>
          )
        }
      />

      {/* filters */}
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="Title or description..."
            value={filters.search}
            onChange={set('search')}
          />
        </div>
        <div className="w-40">
          <label className="label">Status</label>
          <select className="input" value={filters.status} onChange={set('status')}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label className="label">Priority</label>
          <select className="input" value={filters.priority} onChange={set('priority')}>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p || 'All priorities'}</option>
            ))}
          </select>
        </div>
        <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={filters.overdue === 'true'}
            onChange={(e) => setFilters((f) => ({ ...f, overdue: e.target.checked ? 'true' : '' }))}
          />
          Overdue only
        </label>
      </div>

      <div className="card">
        <DataBoundary
          loading={loading}
          error={error}
          isEmpty={!loading && data?.length === 0}
          onRetry={refresh}
          empty={
            <div className="py-10 text-center">
              <p className="font-semibold text-slate-700">No tasks match these filters</p>
              <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setFilters({ status: '', priority: '', search: '', overdue: '' })}>
                Clear filters
              </button>
            </div>
          }
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
                  <th>Assignee</th>
                  <th>Deadline</th>
                  <th>Skills</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.task_id} className="cursor-pointer" onClick={() => navigate(`/tasks/${t.task_id}`)}>
                    <td className="max-w-[240px]">
                      <Link
                        to={`/tasks/${t.task_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium text-slate-800 hover:text-brand-700"
                      >
                        {t.title}
                      </Link>
                      <span className="text-xs text-slate-400">#{t.task_id}</span>
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
                    <td className="whitespace-nowrap text-slate-600">
                      {t.assigned_employee_name || <span className="text-slate-400">Unassigned</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={t.is_overdue ? 'font-semibold text-red-600' : 'text-slate-600'}>
                        {fmtShortDate(t.deadline)}
                      </span>
                      <span className="block text-xs text-slate-400">{relativeDeadline(t.deadline)}</span>
                    </td>
                    <td className="max-w-[200px] truncate text-xs text-slate-500">
                      {t.required_skills_text || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            {tasks.length} task{tasks.length === 1 ? '' : 's'}
          </p>
        </DataBoundary>
      </div>

      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(message) => {
          setCreateOpen(false);
          setToast({ type: 'success', message });
          refresh();
        }}
        onError={(message) => setToast({ type: 'error', message })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/**
 * Task creation form. Required skills can be attached and the database
 * engine can be triggered in the same request.
 */
function CreateTaskModal({ open, onClose, onCreated, onError }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState([]);
  const [pending, setPending] = useState(false);

  const projects = useApi(() => projectsApi.list(), [open]);
  const skills = useApi(() => skillsApi.list(), [open]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  function toggleSkill(skill) {
    setSelected((prev) =>
      prev.some((s) => s.skill_id === skill.skill_id)
        ? prev.filter((s) => s.skill_id !== skill.skill_id)
        : [...prev, { skill_id: skill.skill_id, required_level: 3, is_mandatory: true, name: skill.name }]
    );
  }

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      const result = await tasksApi.create({
        ...form,
        estimated_hours: Number(form.estimated_hours),
        project_id: Number(form.project_id),
        required_skills: selected.map(({ skill_id, required_level, is_mandatory }) => ({
          skill_id,
          required_level,
          is_mandatory,
        })),
      });
      const allocation = result.allocation;
      onCreated(
        allocation?.allocated
          ? `Task "${form.title}" created and allocated to ${allocation.employee.employee_name} (score ${allocation.score})`
          : `Task "${form.title}" created${allocation ? ' but no employee matched the rules' : ''}`
      );
      setForm(EMPTY_FORM);
      setSelected([]);
    } catch (err) {
      onError(Array.isArray(err.details) ? err.details.join(', ') : err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create task"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="create-task-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} {pending ? 'Creating...' : 'Create task'}
          </button>
        </>
      }
    >
      <form id="create-task-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="t-project">Project *</label>
          <select id="t-project" className="input" required value={form.project_id} onChange={set('project_id')}>
            <option value="">Select a project</option>
            {projects.data?.data?.map((p) => (
              <option key={p.project_id} value={p.project_id}>{p.code} — {p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="t-title">Title *</label>
          <input id="t-title" className="input" required maxLength={200} value={form.title} onChange={set('title')} />
        </div>

        <div>
          <label className="label" htmlFor="t-desc">Description</label>
          <textarea id="t-desc" className="input" rows={3} value={form.description} onChange={set('description')} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="t-hours">Estimated hours *</label>
            <input id="t-hours" className="input" type="number" step="0.5" min="0.5" required value={form.estimated_hours} onChange={set('estimated_hours')} />
          </div>
          <div>
            <label className="label" htmlFor="t-priority">Priority</label>
            <select id="t-priority" className="input" value={form.priority} onChange={set('priority')}>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="t-deadline">Deadline</label>
            <input id="t-deadline" className="input" type="date" min={todayISO()} value={form.deadline} onChange={set('deadline')} />
          </div>
        </div>

        <div>
          <p className="label">Required skills</p>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {skills.loading && <p className="p-2 text-sm text-slate-400">Loading skills...</p>}
            {skills.data?.data?.map((s) => {
              const on = selected.some((x) => x.skill_id === s.skill_id);
              const entry = selected.find((x) => x.skill_id === s.skill_id);
              return (
                <div key={s.skill_id} className="flex items-center gap-3 rounded px-2 py-1 hover:bg-slate-50">
                  <input
                    id={`skill-${s.skill_id}`}
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleSkill(s)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor={`skill-${s.skill_id}`} className="flex-1 cursor-pointer text-sm text-slate-700">
                    {s.name} <span className="text-xs text-slate-400">({s.category.toLowerCase()})</span>
                  </label>
                  {on && (
                    <>
                      <select
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        value={entry.required_level}
                        onChange={(e) =>
                          setSelected((prev) =>
                            prev.map((x) =>
                              x.skill_id === s.skill_id
                                ? { ...x, required_level: Number(e.target.value) }
                                : x
                            )
                          )
                        }
                      >
                        {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={entry.is_mandatory}
                          onChange={(e) =>
                            setSelected((prev) =>
                              prev.map((x) =>
                                x.skill_id === s.skill_id
                                  ? { ...x, is_mandatory: e.target.checked }
                                  : x
                              )
                            )
                          }
                        />
                        must
                      </label>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Mandatory skills are a hard filter: an employee missing one of them is never selected.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <input
            type="checkbox"
            checked={form.auto_allocate}
            onChange={set('auto_allocate')}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="block text-sm font-semibold text-brand-900">
              Allocate automatically on creation
            </span>
            <span className="block text-xs text-brand-700">
              Runs the suitability engine immediately and assigns the best matching employee.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}