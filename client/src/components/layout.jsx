import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NAV, NavIcon } from './navConfig';
import { initials, avatarColour } from '../lib/format';

// Pages import their shared UI from this module so there is one entry point.
export {
  PageHeader,
  DataBoundary,
  Modal,
  Spinner,
  EmptyState,
  ErrorState,
  Pagination,
  Toast,
} from './ui';

function SidebarLink({ to, label, icon, isActiveClass }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-link ${isActive ? isActiveClass : ''}`}
    >
      <NavIcon name={icon} className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((section) => section.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
          <NavIcon name="target" className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">Smart Workforce</p>
          <p className="truncate text-xs text-slate-500">Task Allocation System</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.section}>
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {section.section}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} {...item} isActiveClass="nav-link-active" />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColour(user?.full_name || '')}`}>
            {initials(user?.full_name || 'U')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.full_name}</p>
            <p className="truncate text-xs text-slate-500">
              {user?.role === 'ADMIN' ? 'Administrator' : user?.employee?.job_title || 'Employee'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="btn-ghost btn-sm shrink-0"
          >
            <NavIcon name="logout" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 animate-slide-in bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <Link to="/" className="font-bold text-slate-900">Smart Workforce</Link>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8" key={location.pathname}>
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400">
          Smart Workforce &amp; Task Allocation &middot; allocation rules run inside PostgreSQL
        </footer>
      </div>
    </div>
  );
}