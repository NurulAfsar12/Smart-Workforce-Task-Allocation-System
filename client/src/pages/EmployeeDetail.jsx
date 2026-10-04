import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { StatusBadge, PriorityBadge, WorkloadBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, fmtDate, todayISO, initials, avatarColour } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { employeesApi, skillsApi } from '../api/client';

const AVAILABILITY_STATUSES = ['AVAILABLE', 'PARTIALLY_AVAILABLE', 'UNAVAILABLE', 'ON_LEAVE'];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [toast, setToast] = useState(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const detail = useApi(() => employeesApi.get(id), [id]);

  if (detail.loading) {
    return (
      <>
        <PageHeader title="Employee" />
        <DataBoundary loading />
      </>
    );
  }
  if (detail.error) {
    return (
      <>
        <PageHeader title="Employee" />
        <DataBoundary error={detail.error} onRetry={detail.refresh} />
      </>
    );
  }

  // `detail.data` is the response envelope; the employee sits under `data`.
  const e = detail.data?.data;
  if (!e) {
    return (
      <>
        <PageHeader title="Employee" />
        <DataBoundary isEmpty emptyMessage="This employee record no longer exists." />
      </>
    );
  }

  const w = e.workload || {};
  const taskList = e.tasks ?? [];
  const skillList = e.skills ?? [];
  const availabilityList = e.availability ?? [];
  const openTasks = taskList.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
  const completedTasks = taskList.filter((t) => t.status === 'COMPLETED').length;

  // fn_employee_workload() does not return the band, so derive it from the
  // utilisation the same way v_employee_workload does.
  const util = Number(w.utilization_pct || 0);
  const workloadLevel =
    e.employment_status !== 'ACTIVE' ? 'INACTIVE'
      : util === 0 ? 'FREE'
        : util <= 50 ? 'LIGHT'
          : util <= 80 ? 'BALANCED'
            : util <= 100 ? 'HEAVY'
              : 'OVERLOADED';

  async function removeSkill(skillId, name) {
    if (!window.confirm(`Remove ${name} from this employee?`)) return;
    setPending(true);
    try {
      await employeesApi.removeSkill(id, skillId);
      setToast({ type: 'success', message: `${name} removed` });
      detail.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  async function removeAvailability(avId) {
    setPending(true);
    try {
      await employeesApi.removeAvailability(id, avId);
      detail.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  async function toggleAvailability() {
    setPending(true);
    try {
      await employeesApi.update(id, { is_available: !e.is_available });
      setToast({ type: 'success', message: e.is_available ? 'Marked unavailable' : 'Marked available' });
      detail.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          <p className="mb-1 text-xs text-slate-500">
            <Link to="/employees" className="hover:text-brand-700 hover:underline">Employees</Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span>{e.employee_code}</span>
          </p>
        }
        title={e.employee_name}
        description={`${e.job_title || 'No title'} · ${e.department_name}${e.manager_name ? ` · reports to ${e.manager_name}` : ''}`}
        actions={
          <>
            <button type="button" className="btn-secondary" disabled={pending} onClick={toggleAvailability}>
              {e.is_available ? 'Mark unavailable' : 'Mark available'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setLeaveOpen(true)}>
              + Time off
            </button>
            <button type="button" className="btn-primary" onClick={() => setSkillOpen(true)}>
              + Add skill
            </button>
          </>
        }
      />

      {/* identity + workload */}
      <div className="mb-5 grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center gap-4">
            <span className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold ${avatarColour(e.employee_name)}`}>
              {initials(e.employee_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{e.employee_name}</p>
              <p className="truncate text-sm text-slate-500">{e.employee_code}</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                <span className={`badge ${e.employment_status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                  {e.employment_status}
                </span>
                {!e.is_available && <span className="badge bg-amber-100 text-amber-800">Unavailable</span>}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            {[
              ['Email', e.email],
              ['Phone', e.phone],
              ['Hire date', fmtDate(e.hire_date)],
              ['Manager', e.manager_name || '—'],
              ['Department', e.department_name],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-slate-500">{label}</dt>
                <dd className="truncate font-medium text-slate-800">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-800">Current workload</h2>
          <div className="mb-4 flex items-center justify-between">
            <WorkloadBadge level={workloadLevel} />
            <span className="text-sm font-semibold tabular-nums text-slate-700">{util}%</span>
          </div>
          <div className="mb-4"><UtilisationBar percent={util} showLabel={false} /></div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Allocated', fmtHours(w.allocated_hours), 'text-brand-700'],
              ['Free capacity', fmtHours(w.remaining_hours), 'text-emerald-600'],
              ['Open tasks', w.open_tasks, 'text-slate-800'],
              ['Overdue', w.overdue_tasks, Number(w.overdue_tasks) > 0 ? 'text-red-600' : 'text-slate-800'],
              ['Completed', completedTasks, 'text-slate-800'],
              ['Logged hours', fmtHours(w.logged_hours), 'text-slate-800'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={`text-lg font-bold tabular-nums ${tone}`}>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card flex flex-col p-5">
          <h2 className="mb-4 font-semibold text-slate-800">Availability</h2>
          {availabilityList.length === 0 ? (
            <p className="text-sm text-slate-400">No upcoming leave or capacity changes recorded.</p>
          ) : (
            <ul className="space-y-2">
              {availabilityList.map((a) => (
                <li
                  key={a.availability_id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {fmtDate(a.date_from)} &rarr; {fmtDate(a.date_to)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.status.replace(/_/g, ' ')}
                      {a.reason && ` — ${a.reason}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => removeAvailability(a.availability_id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto pt-4 text-xs text-slate-500">
            An <strong>UNAVAILABLE</strong> period covering a task deadline removes this employee
            from the candidate list entirely.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* skills */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-slate-800">Skills</h2>
            <span className="badge bg-slate-100 text-slate-700">{skillList.length}</span>
          </div>
          {skillList.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              No skills recorded. Employees with no skills can still receive tasks that require none.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Category</th>
                    <th className="text-center">Level</th>
                    <th className="text-right">Years</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {skillList.map((s) => (
                    <tr key={s.skill_id}>
                      <td className="font-medium text-slate-800">
                        {s.skill_name}
                        {s.is_primary && <span className="ml-1.5 badge bg-brand-50 text-brand-700">Primary</span>}
                      </td>
                      <td className="text-slate-600">{s.category}</td>
                      <td className="text-center">
                        <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                          L{s.proficiency_level}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-slate-600">{Number(s.years_experience)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removeSkill(s.skill_id, s.skill_name)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* tasks */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-slate-800">Assigned tasks</h2>
            <span className="badge bg-slate-100 text-slate-700">{openTasks.length} open</span>
          </div>
          {taskList.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No tasks assigned yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {taskList.map((t) => (
                <li key={t.task_id}>
                  <Link to={`/tasks/${t.task_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span className={t.is_overdue ? 'font-semibold text-red-600' : ''}>
                          {t.deadline ? fmtDate(t.deadline) : 'No deadline'}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="tabular-nums">
                          {fmtHours(t.actual_hours)} / {fmtHours(t.estimated_hours)}
                        </span>
                      </p>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AddSkillModal
        open={skillOpen}
        employeeId={id}
        existing={skillList.map((s) => s.skill_id)}
        onClose={() => setSkillOpen(false)}
        onAdded={(name) => {
          setSkillOpen(false);
          setToast({ type: 'success', message: `${name} added` });
          detail.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <AddAvailabilityModal
        open={leaveOpen}
        employeeId={id}
        onClose={() => setLeaveOpen(false)}
        onAdded={() => {
          setLeaveOpen(false);
          setToast({ type: 'success', message: 'Availability recorded' });
          detail.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function AddSkillModal({ open, employeeId, existing, onClose, onAdded, onError }) {
  const [form, setForm] = useState({ skill_id: '', proficiency_level: 3, years_experience: 0, is_primary: false });
  const [pending, setPending] = useState(false);
  const skills = useApi(() => skillsApi.list(), [open]);

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      await employeesApi.addSkill(employeeId, {
        ...form,
        skill_id: Number(form.skill_id),
        proficiency_level: Number(form.proficiency_level),
        years_experience: Number(form.years_experience),
      });
      const name = skills.data?.data?.find((s) => s.skill_id === Number(form.skill_id))?.name;
      onAdded(name || 'Skill');
      setForm({ skill_id: '', proficiency_level: 3, years_experience: 0, is_primary: false });
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
      title="Add or update a skill"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-skill-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="add-skill-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="s-skill">Skill *</label>
          <select id="s-skill" className="input" required value={form.skill_id} onChange={(e) => setForm((f) => ({ ...f, skill_id: e.target.value }))}>
            <option value="">Select a skill</option>
            {skills.data?.data?.map((s) => (
              <option key={s.skill_id} value={s.skill_id}>
                {s.name} ({s.category})
                {existing.includes(s.skill_id) ? ' — update' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="s-level">Proficiency (1-5) *</label>
            <select
              id="s-level"
              className="input"
              value={form.proficiency_level}
              onChange={(e) => setForm((f) => ({ ...f, proficiency_level: e.target.value }))}
            >
              {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Level {l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="s-years">Years of experience</label>
            <input
              id="s-years"
              className="input"
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={form.years_experience}
              onChange={(e) => setForm((f) => ({ ...f, years_experience: e.target.value }))}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_primary}
            onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Primary specialisation
        </label>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          The level is compared against the level a task requires: an employee only matches when
          their proficiency is at or above the required level. Re-adding an existing skill updates it.
        </p>
      </form>
    </Modal>
  );
}

function AddAvailabilityModal({ open, employeeId, onClose, onAdded, onError }) {
  const [form, setForm] = useState({
    date_from: todayISO(), date_to: todayISO(),
    status: 'UNAVAILABLE', available_hours: 0, reason: '',
  });
  const [pending, setPending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      await employeesApi.addAvailability(employeeId, {
        ...form,
        available_hours: Number(form.available_hours),
      });
      onAdded();
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
      title="Record availability"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="add-availability-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="add-availability-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="a-from">From *</label>
            <input
              id="a-from"
              className="input"
              type="date"
              required
              value={form.date_from}
              onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="a-to">To *</label>
            <input
              id="a-to"
              className="input"
              type="date"
              required
              value={form.date_to}
              onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="a-status">Status</label>
          <select
            id="a-status"
            className="input"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {AVAILABILITY_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="a-reason">Reason</label>
          <input
            id="a-reason"
            className="input"
            placeholder="Annual leave, training, part-time..."
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}