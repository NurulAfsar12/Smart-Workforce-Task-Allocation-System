import { useState } from 'react';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { useApi } from '../hooks/useApi';
import { departmentsApi } from '../api/client';

const EMPTY = { code: '', name: '', description: '', budget_hours: '160' };

export default function Departments() {
  const [editing, setEditing] = useState(null); // null | 'new' | department object
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState(false);

  const departments = useApi(() => departmentsApi.list(), []);

  const departmentList = departments.data?.data ?? [];

  async function remove(d) {
    if (!window.confirm(`Delete ${d.name}? Departments with employees or projects are blocked by foreign keys.`)) return;
    setPending(true);
    try {
      await departmentsApi.remove(d.department_id);
      setToast({ type: 'success', message: `${d.name} deleted` });
      departments.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments own employees, projects and a weekly hour budget. Projects inherit the department for allocation bonus purposes."
        actions={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>+ New department</button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DataBoundary
          loading={departments.loading}
          error={departments.error}
          onRetry={departments.refresh}
          isEmpty={departmentList.length === 0}
          emptyTitle="No departments"
          emptyMessage="Create one to start adding employees and projects."
        >
          {departmentList.map((d) => {
            return (
              <div key={d.department_id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-brand-700">{d.code}</p>
                    <h3 className="truncate font-semibold text-slate-900">{d.name}</h3>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(d)}>Edit</button>
                    <button type="button" className="btn-ghost btn-sm text-red-600" disabled={pending} onClick={() => remove(d)}>Delete</button>
                  </div>
                </div>

                {d.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-slate-500">{d.description}</p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                  <div>
                    <p className="text-lg font-bold tabular-nums text-slate-800">{d.employee_count}</p>
                    <p className="text-[11px] text-slate-500">People</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-slate-800">{d.project_count}</p>
                    <p className="text-[11px] text-slate-500">Projects</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums text-brand-700">{Number(d.budget_hours) ? `${d.budget_hours}h` : '—'}</p>
                    <p className="text-[11px] text-slate-500">Budget/wk</p>
                  </div>
                </div>
              </div>
            );
          })}
        </DataBoundary>
      </div>

      <DepartmentModal
        department={editing}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          setToast({ type: 'success', message: `${name} saved` });
          departments.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function DepartmentModal({ department, onClose, onSaved, onError }) {
  const isNew = department === 'new';
  const [form, setForm] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load the values of the row being edited once, when it changes.
  if (department && !isNew && !loaded) {
    setLoaded(true);
    setForm({
      code: department.code || '',
      name: department.name || '',
      description: department.description || '',
      budget_hours: String(department.budget_hours ?? ''),
    });
  }

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      const body = { ...form, budget_hours: Number(form.budget_hours) };
      if (isNew) await departmentsApi.create(body);
      else await departmentsApi.update(department.department_id, body);
      onSaved(form.name);
      setForm(EMPTY);
      setLoaded(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={Boolean(department)}
      onClose={() => {
        setLoaded(false);
        onClose();
      }}
      title={isNew ? 'New department' : `Edit ${department?.name || ''}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="department-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="department-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="d-code">Code *</label>
            <input
              id="d-code"
              className="input"
              required
              maxLength={10}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="ENG"
            />
          </div>
          <div className="col-span-2">
            <label className="label" htmlFor="d-name">Name *</label>
            <input
              id="d-name"
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="d-desc">Description</label>
          <textarea
            id="d-desc"
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div>
          <label className="label" htmlFor="d-budget">Weekly hour budget</label>
          <input
            id="d-budget"
            className="input"
            type="number"
            min="0"
            step="8"
            value={form.budget_hours}
            onChange={(e) => setForm((f) => ({ ...f, budget_hours: e.target.value }))}
          />
          <p className="mt-1 text-xs text-slate-500">Reference figure for capacity planning.</p>
        </div>
      </form>
    </Modal>
  );
}