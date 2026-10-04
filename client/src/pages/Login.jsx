import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui';
import { NavIcon } from '../components/navConfig';

const DEMO_ACCOUNTS = [
  { email: 'admin@smartworkforce.com', label: 'Administrator', hint: 'Full access to every module' },
  { email: 'tanvirahmed@smartworkforce.com', label: 'DevOps Engineer', hint: 'Employee view of assigned work' },
  { email: 'ayesha.rahman@smartworkforce.com', label: 'Senior Engineer', hint: 'Heavily loaded, 1 open task' },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@smartworkforce.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* left: brand panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/15">
            <NavIcon name="target" className="h-6 w-6" />
          </div>
          <span className="text-lg font-bold">Smart Workforce</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">
            Tasks are assigned by the database, not by guesswork.
          </h1>
          <p className="mt-4 text-brand-100">
            Every allocation is decided by a suitability score built from skills, skill level,
            workload in hours, availability and deadline pressure.
          </p>

          <div className="mt-10 space-y-4">
            {[
              ['Hours based workload', 'Two people with 2 tasks can carry 4h or 12h of work.'],
              ['Rule driven allocation', 'Skills, availability and capacity are hard filters.'],
              ['Full audit trail', 'Every status change is recorded automatically.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-sm text-brand-100">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-brand-200">React &middot; Express &middot; PostgreSQL &middot; JWT</p>
      </div>

      {/* right: form */}
      <div className="flex w-full items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
              <NavIcon name="target" className="h-5 w-5" />
            </div>
            <span className="font-bold text-slate-900">Smart Workforce</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your work account to continue.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@smartworkforce.com"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? <Spinner /> : null}
              {pending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Demo accounts &mdash; password <code className="text-brand-700">Password123!</code>
            </p>
            <ul className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <li key={acc.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword('Password123!');
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white"
                  >
                    <p className="text-xs font-semibold text-slate-800">{acc.label}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">{acc.email}</p>
                    <p className="text-[11px] text-slate-400">{acc.hint}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}