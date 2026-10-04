import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { StatusBadge, PriorityBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtDate, relativeDeadline, todayISO } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { projectsApi, departmentsApi, employeesApi } from '../api/client';

const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

const STATUS_TONES = {
  PLANNED: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const EMPTY = {
  code: '', name: '', description: '', department_id: '', lead_id: '',
  start_date: todayISO(), end_date: '', budget_hours: '', status: 'PLANNED',
};

export default function Projects() {
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState(false);

  const projects = useApi(
    () => projectsApi.list(filters),
    [filters.status, filters.search]
  );
  const departments = useApi(() => departmentsApi.list(), []);
  const detail = useApi(() => (expanded ? projectsApi.get(expanded) : null), [expanded]);

  const projectList = projects.data?.data ?? [];

  async function changeStatus(p, status) {
    setPending(true);
    try {
      await projectsApi.update(p.project_id, { status });
      setToast({ type: 'success', message: `${p.name} set to ${status.replace(/_/g, ' ').toLowerCase()}` });
      projects.refresh();
      if (expanded === p.project_id) detail.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Projects group tasks and inherit a department, which gives a small allocation score bonus to people from the same department."
        actions={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>+ New project</button>}
      />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="Project name or code..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="w-48">
          <label className="label">Status</label>
          <select
            className="input"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <DataBoundary
        loading={projects.loading}
        error={projects.error}
        onRetry={projects.refresh}
        isEmpty={projectList.length === 0}
        emptyTitle="No projects"
        emptyMessage="Create a project, then add tasks to it."
      >
        <div className="space-y-4">
          {projectList.map((p) => {
            const open = expanded === p.project_id;
            return (
              <div key={p.project_id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpanded(open ? null : p.project_id)}
                  >
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                        {p.code}
                      </span>
                      <span className={`badge ${STATUS_TONES[p.status] || 'bg-slate-100 text-slate-700'}`}>
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </p>
                    <p className="mt-1 truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{p.department_name}</span>
                      {p.lead_name && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>Lead: {p.lead_name}</span>
                        </>
                      )}
                      <span className="text-slate-300">|</span>
                      <span>{fmtDate(p.start_date)} &rarr; {fmtDate(p.end_date)}</span>
                    </p>
                  </button>

                  <div className="flex items-center gap-5">
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums text-slate-800">{p.completed_tasks}/{p.total_tasks}</p>
                      <p className="text-[11px] text-slate-500">tasks done</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums text-slate-800">
                        {fmtHours(p.actual_hours)}
                      </p>
                      <p className="text-[11px] text-slate-500">of {fmtHours(p.estimated_hours)}</p>
                    </div>
                    <div className="w-32">
                      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                        <span>Progress</span>
                        <span className="font-semibold tabular-nums">{Math.round(Number(p.completion_pct))}%</span>
                      </div>
                      <UtilisationBar percent={p.completion_pct} showLabel={false} />
                      {Number(p.budget_usage_pct) > 100 && (
                        <p className="mt-1 text-right text-[11px] font-semibold text-red-600">
                          {Math.round(Number(p.budget_usage_pct))}% of budget
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                      {p.status === 'PLANNED' && (
                        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => changeStatus(p, 'ACTIVE')}>
                          Start
                        </button>
                      )}
                      {p.status === 'ACTIVE' && (
                        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => changeStatus(p, 'COMPLETED')}>
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-slate-200 bg-slate-50/60 p-5">
                    {detail.loading && (
                      <p className="flex items-center gap-2 py-6 text-sm text-slate-400">
                        <Spinner className="h-4 w-4" /> Loading tasks...
                      </p>
                    )}
                    {detail.data && (
                      <>
                        {detail.data.description && (
                          <p className="mb-4 text-sm text-slate-600">{detail.data.description}</p>
                        )}
                        {detail.data.tasks.length === 0 ? (
                          <p className="py-6 text-center text-sm text-slate-400">No tasks in this project yet.</p>
                        ) : (
                          <div className="table-wrap rounded-lg border border-slate-200 bg-white">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Task</th>
                                  <th>Status</th>
                                  <th>Priority</th>
                                  <th className="text-right">Effort</th>
                                  <th>Assignee</th>
                                  <th>Deadline</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.data.tasks.map((t) => (
                                  <tr key={t.task_id}>
                                    <td className="max-w-[260px]">
                                      <Link to={`/tasks/${t.task_id}`} className="block truncate font-medium text-slate-800 hover:text-brand-700">
                                        {t.title}
                                      </Link>
                                    </td>
                                    <td><StatusBadge status={t.status} /></td>
                                    <td><PriorityBadge priority={t.priority} /></td>
                                    <td className="whitespace-nowrap text-right tabular-nums text-slate-600">
                                      {fmtHours(t.actual_hours)} / {fmtHours(t.estimated_hours)}
                                    </td>
                                    <td className="whitespace-nowrap text-slate-600">
                                      {t.assigned_employee_name || <span className="text-slate-400">Unassigned</span>}
                                    </td>
                                    <td className="whitespace-nowrap">
                                      <span className={t.is_overdue ? 'font-semibold text-red-600' : 'text-slate-600'}>
                                        {relativeDeadline(t.deadline)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DataBoundary>

      <ProjectModal
        project={editing}
        departments={departments.data?.data || []}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          setToast({ type: 'success', message: `${name} saved` });
          projects.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function ProjectModal({ project, departments, onClose, onSaved, onError }) {
  const isNew = project === 'new';
  const [form, setForm] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [leads, setLeads] = useState({ status: 'idle', data: [] });

  const departmentId = form.department_id;

  // Load the employees of the selected department so the lead picker only
  // offers people who actually belong to it.
  useEffect(() => {
    if (!departmentId) {
      setLeads({ status: 'idle', data: [] });
      return undefined;
    }
    let cancelled = false;
    setLeads({ status: 'loading', data: [] });
    employeesApi
      .list({ department_id: departmentId })
      .then((res) => !cancelled && setLeads({ status: 'ready', data: res.data }))
      .catch(() => !cancelled && setLeads({ status: 'error', data: [] }));
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  // Reset the form whenever the modal target changes. Doing this in an effect
  // (rather than during render) keeps a "new project" form from inheriting the
  // values of a project that was open a moment ago.
  const projectId = isNew ? 'new' : project?.project_id ?? null;

  useEffect(() => {
    if (projectId === null) return;
    if (projectId === 'new') {
      setForm(EMPTY);
      return;
    }
    setForm({
      code: project.code || '',
      name: project.name || '',
      description: project.description || '',
      department_id: String(project.department_id || ''),
      lead_id: project.lead_id ? String(project.lead_id) : '',
      start_date: project.start_date ? String(project.start_date).slice(0, 10) : '',
      end_date: project.end_date ? String(project.end_date).slice(0, 10) : '',
      budget_hours: project.budget_hours != null ? String(project.budget_hours) : '',
      status: project.status || 'PLANNED',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      const body = {
        ...form,
        department_id: Number(form.department_id),
        lead_id: form.lead_id ? Number(form.lead_id) : null,
        budget_hours: form.budget_hours === '' ? null : Number(form.budget_hours),
      };
      if (isNew) await projectsApi.create(body);
      else await projectsApi.update(project.project_id, body);
      onSaved(form.name);
      setForm(EMPTY);
      setLoadedId(null);
    } catch (err) {
      onError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={Boolean(project)}
      onClose={onClose}
      title={isNew ? 'New project' : `Edit ${project?.name || ''}`}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="project-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="p-code">Code</label>
          <input id="p-code" className="input" value={form.code} onChange={set('code')} placeholder="PRJ-001" />
        </div>
        <div>
          <label className="label" htmlFor="p-name">Name *</label>
          <input id="p-name" className="input" required value={form.name} onChange={set('name')} />
        </div>

        <div>
          <label className="label" htmlFor="p-dept">Department *</label>
          <select id="p-dept" className="input" required value={form.department_id} onChange={set('department_id')}>
            <option value="">Select</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-lead">Lead</label>
          <select id="p-lead" className="input" value={form.lead_id} onChange={set('lead_id')} disabled={!form.department_id}>
            <option value="">No lead</option>
            {leads.status === 'loading' && <option>Loading...</option>}
            {leads.status === 'ready' && leads.data.map((e) => (
              <option key={e.employee_id} value={e.employee_id}>{e.employee_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="p-start">Start date</label>
          <input id="p-start" className="input" type="date" value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label className="label" htmlFor="p-end">End date</label>
          <input id="p-end" className="input" type="date" value={form.end_date} onChange={set('end_date')} />
        </div>

        <div>
          <label className="label" htmlFor="p-budget">Budget hours</label>
          <input id="p-budget" className="input" type="number" min="0" step="8" value={form.budget_hours} onChange={set('budget_hours')} />
        </div>
        <div>
          <label className="label" htmlFor="p-status">Status</label>
          <select id="p-status" className="input" value={form.status} onChange={set('status')}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className="label" htmlFor="p-desc">Description</label>
          <textarea id="p-desc" className="input" rows={3} value={form.description} onChange={set('description')} />
        </div>
      </form>
    </Modal>
  );
}