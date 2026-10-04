import { useState } from 'react';
import { PageHeader, DataBoundary, Modal, Spinner, Toast } from '../components/layout';
import { SupplyBadge } from '../lib/badges';
import { useApi } from '../hooks/useApi';
import { skillsApi, reportsApi } from '../api/client';

const CATEGORIES = [
  'LANGUAGE', 'FRAMEWORK', 'DATABASE', 'CLOUD', 'DEVOPS', 'SECURITY',
  'DATA', 'DESIGN', 'TESTING', 'PROJECT_MANAGEMENT', 'SOFT_SKILL', 'TOOLING', 'OTHER',
];

const EMPTY = { name: '', category: 'OTHER', description: '' };

export default function Skills() {
  const [filters, setFilters] = useState({ search: '', category: '' });
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState(false);

  const skills = useApi(() => skillsApi.list(filters), [filters.search, filters.category]);
  const supply = useApi(() => reportsApi.skills(), []);

  const skillList = skills.data?.data ?? [];

  // Combine the catalogue with the demand/supply view so gaps are obvious.
  const supplyById = new Map((supply.data?.data || []).map((s) => [s.skill_id, s]));

  async function toggleActive(skill) {
    setPending(true);
    try {
      await skillsApi.update(skill.skill_id, { is_active: !skill.is_active });
      skills.refresh();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Skills"
        description="The skill catalogue drives every allocation decision. Demand comes from open tasks, supply from active employees holding the skill."
        actions={<button type="button" className="btn-primary" onClick={() => setCreating(true)}>+ New skill</button>}
      />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="label">Search</label>
          <input
            className="input"
            placeholder="Skill name..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <div className="w-56">
          <label className="label">Category</label>
          <select
            className="input"
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <DataBoundary
          loading={skills.loading}
          error={skills.error}
          onRetry={skills.refresh}
          isEmpty={skillList.length === 0}
          emptyTitle="No skills found"
          emptyMessage="Adjust the filters or add a new skill."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Category</th>
                  <th className="text-center">People</th>
                  <th className="text-center">Avg level</th>
                  <th className="text-right">Open tasks</th>
                  <th>Supply</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {skillList.map((s) => {
                  const gap = supplyById.get(s.skill_id);
                  return (
                    <tr key={s.skill_id} className={!s.is_active ? 'opacity-60' : ''}>
                      <td>
                        <p className="font-medium text-slate-800">{s.name}</p>
                        {s.description && <p className="max-w-sm truncate text-xs text-slate-500">{s.description}</p>}
                      </td>
                      <td className="whitespace-nowrap text-slate-600">
                        {String(s.category).replace(/_/g, ' ').toLowerCase()}
                      </td>
                      <td className="text-center tabular-nums text-slate-700">{s.employee_count}</td>
                      <td className="text-center">
                        {s.employee_count > 0 ? (
                          <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-700">
                            {Number(s.avg_proficiency).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        <span className={Number(gap?.open_tasks_requiring) > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                          {gap?.open_tasks_requiring ?? 0}
                        </span>
                        {Number(gap?.open_hours_required) > 0 && (
                          <span className="block text-xs text-slate-400">{gap.open_hours_required}h</span>
                        )}
                      </td>
                      <td><SupplyBadge status={gap?.supply_status || 'IDLE'} /></td>
                      <td>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleActive(s)}
                          className={`badge ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                        >
                          {s.is_active ? 'Active' : 'Retired'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            A skill with zero qualified people and open tasks needing it is a{' '}
            <strong>critical gap</strong>: the engine will refuse to allocate those tasks.
          </p>
        </DataBoundary>
      </div>

      <CreateSkillModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          setToast({ type: 'success', message: `${name} added to the catalogue` });
          skills.refresh();
          supply.refresh();
        }}
        onError={(m) => setToast({ type: 'error', message: m })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function CreateSkillModal({ open, onClose, onCreated, onError }) {
  const [form, setForm] = useState(EMPTY);
  const [pending, setPending] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    try {
      await skillsApi.create(form);
      onCreated(form.name);
      setForm(EMPTY);
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
      title="New skill"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="create-skill-form" className="btn-primary" disabled={pending}>
            {pending && <Spinner />} Create
          </button>
        </>
      }
    >
      <form id="create-skill-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="sk-name">Name *</label>
          <input
            id="sk-name"
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="sk-cat">Category</label>
          <select
            id="sk-cat"
            className="input"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sk-desc">Description</label>
          <textarea
            id="sk-desc"
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}