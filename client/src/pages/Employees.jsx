import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { WorkloadBadge, UtilisationBar } from '../lib/badges';
import { fmtHours, initials, avatarColour } from '../lib/format';
import { useApi } from '../hooks/useApi';
import { employeesApi, departmentsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED'];
const LEVELS = ['', 'FREE', 'LIGHT', 'BALANCED', 'HEAVY', 'OVERLOADED', 'INACTIVE'];
const SORTS = [
  ['employee_name', 'Name'],
  ['utilization', 'Utilisation'],
  ['allocated', 'Allocated hours'],
  ['remaining', 'Free hours'],
  ['open_tasks', 'Open tasks'],
  ['overdue', 'Overdue tasks'],
];

const EMPTY_FORM = {
  employee_code: '', first_name: '', last_name: '', email: '', phone: '',
  job_title: '', department_id: '', hire_date: '', employment_status: 'ACTIVE',
  weekly_capacity_hours: '40', is_available: true,
};

export default function Employees() {
  const { employeeId } = useAuth();
  const [filters, setFilters] = useState({ search: '', department_id: '', status: '', workload_level: '' });
  const [sort, setSort] = useState({ sort_by: 'employee_name', order: 'asc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const employees = useApi(
    () => employeesApi.list({ ...filters, ...sort }),
    [filters.search, filters.department_id, filters.status, filters.workload_level, sort.sort_by, sort.order]
  );
  const departments = useApi(() => departmentsApi.list(), []);

  const employeeList = employees.data?.data ?? [];

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Employees"
        description="Skills, capacity and current load for everyone in the organisation."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            + New employee
          </button>
        }
      />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label">Search</label>
          <input className="input" placeholder="Name, code or job title..." value={filters.search} onChange={set('search')} />
        </div>
        <div className="w-48">
          <label className="label">Department</label>
          <select className="input" value={filters.department_id} onChange={set('department_id')}>
            <option value="">All</option>
            {departments.data?.data?.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="label">Employment</label>
          <select className="input" value={filters.status} onChange={set('status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, ' ').toLowerCase() : 'All'}</option>)}
          </select>
        </div>
        <div className="w-40">
          <label className="label">Workload</label>
          <select className="input" value={filters.workload_level} onChange={set('workload_level')}>
            {LEVELS.map((l) => <option key={l} value={l}>{l ? l.toLowerCase() : 'All'}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <select
            className="input w-40"
            value={sort.sort_by}
            onChange={(e) => setSort((s) => ({ ...s, sort_by: e.target.value }))}
          >
            {SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
          </select>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setSort((s) => ({ ...s, order: s.order === 'asc' ? 'desc' : 'asc' }))}
          >
            {sort.order === 'asc' ? 'Asc' : 'Desc'}
          </button>
        </div>
      </div>

      <div className="card">
        <DataBoundary
          loading={employees.loading}
          error={employees.error}
          onRetry={employees.refresh}
          isEmpty={employeeList.length === 0}
          emptyTitle="No employees found"
          emptyMessage="Try clearing the filters."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Skills</th>
                  <th>Band</th>
                  <th className="w-48">Utilisation</th>
                  <th className="text-right">Allocated</th>
                  <th className="text-right">Open</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {employeeList.map((e) => (
                  <tr key={e.employee_id}>
                    <td>
                      <Link to={`/employees/${e.employee_id}`} className="flex items-center gap-2.5 hover:underline">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColour(e.employee_name)}`}>
                          {initials(e.employee_name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {e.employee_name}
                            {e.employee_id === employeeId && (
                              <span className="ml-1.5 badge bg-brand-50 text-brand-700">You</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {e.employee_code} &middot; {e.job_title}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{e.department_name}</td>
                    <td className="max-w-[180px] truncate text-xs text-slate-500">{e.skill_names || '—'}</td>
                    <td><WorkloadBadge level={e.workload_level} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <UtilisationBar percent={e.utilization_pct} showLabel={false} className="flex-1" />
                        <span className="w-11 text-right text-xs font-semibold tabular-nums text-slate-600">
                          {Number(e.utilization_pct)}%
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums text-slate-700">
                      {fmtHours(e.allocated_hours)}
                    </td>
                    <td className="text-right tabular-nums text-slate-600">{e.open_tasks}</td>
                    <td>
                      <span className={`badge ${
                        e.employment_status === 'ACTIVE'
                          ? e.is_available
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {e.employment_status === 'ACTIVE' && !e.is_available ? 'UNAVAILABLE' : e.employment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            {employeeList.length} employee{employeeList.length === 1 ? '' : 's'}
          </p>
        </DataBoundary>
      </div>

      <CreateEmployeeModal
        open={createOpen}
        departments={departments.data?.data || []}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => {
          setCreateOpen(false);
          setToast({ type: 'success', message: `${name} added` });
          employees.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function CreateEmployeeModal({ open, departments, onClose, onCreated, onError }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      await employeesApi.create({ ...form, department_id: Number(form.department_id) });
      onCreated(`${form.first_name} ${form.last_name}`);
      setForm(EMPTY_FORM);
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
      title="Add employee"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="create-employee-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Create
          </button>
        </>
      }
    >
      <form id="create-employee-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="e-code">Employee code *</label>
          <input id="e-code" className="input" required value={form.employee_code} onChange={set('employee_code')} placeholder="EMP-101" />
        </div>
        <div>
          <label className="label" htmlFor="e-dept">Department *</label>
          <select id="e-dept" className="input" required value={form.department_id} onChange={set('department_id')}>
            <option value="">Select</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-first">First name *</label>
          <input id="e-first" className="input" required value={form.first_name} onChange={set('first_name')} />
        </div>
        <div>
          <label className="label" htmlFor="e-last">Last name *</label>
          <input id="e-last" className="input" required value={form.last_name} onChange={set('last_name')} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="e-email">Email *</label>
          <input id="e-email" className="input" type="email" required value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="e-title">Job title</label>
          <input id="e-title" className="input" value={form.job_title} onChange={set('job_title')} />
        </div>
        <div>
          <label className="label" htmlFor="e-phone">Phone</label>
          <input id="e-phone" className="input" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label" htmlFor="e-hire">Hire date</label>
          <input id="e-hire" className="input" type="date" value={form.hire_date} onChange={set('hire_date')} />
        </div>
        <div>
          <label className="label" htmlFor="e-cap">Weekly capacity (h) *</label>
          <input
            id="e-cap"
            className="input"
            type="number"
            min="1"
            max="80"
            required
            value={form.weekly_capacity_hours}
            onChange={set('weekly_capacity_hours')}
          />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            id="e-avail"
            type="checkbox"
            checked={form.is_available}
            onChange={set('is_available')}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="e-avail" className="text-sm text-slate-700">
            Available for allocation
          </label>
        </div>
        <p className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Capacity is in hours per week and is the number the allocation engine compares against
          estimated task hours. Add skills on the employee profile page.
        </p>
      </form>
    </Modal>
  );
}