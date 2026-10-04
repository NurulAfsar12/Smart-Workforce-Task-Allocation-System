import { useEffect } from 'react';

export function Spinner({ className = '' }) {
  return (
    <svg className={`animate-spin h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function EmptyState({ title = 'No records found', message = '', action = null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-5l-2 3h-2l-2-3H4" />
      </svg>
      <p className="font-semibold text-slate-700">{title}</p>
      {message && <p className="max-w-sm text-sm text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <p className="font-semibold text-slate-700">Something went wrong</p>
      <p className="max-w-md text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm mt-1" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Accessible modal with Escape-to-close and backdrop click. */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size] || 'max-w-2xl';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full ${width} my-8 animate-fade-in rounded-xl bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const around = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages);

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {pages} &middot; {total} records
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-secondary btn-sm" disabled={page === 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        {around[0] > 1 && <span className="px-1 text-slate-400">…</span>}
        {around.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            className={`btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
          >
            {p}
          </button>
        ))}
        {around[around.length - 1] < pages && <span className="px-1 text-slate-400">…</span>}
        <button type="button" className="btn-secondary btn-sm" disabled={page === pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb}
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Standard loading / error / empty handling so every page renders the
 * same three states before its content.
 */
export function DataBoundary({
  loading,
  error,
  isEmpty = false,
  onRetry,
  emptyTitle,
  emptyMessage,
  empty,
  children,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-20 text-slate-400">
        <Spinner className="h-5 w-5" />
        <span className="text-sm">Loading data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        {empty ?? <EmptyState title={emptyTitle} message={emptyMessage} />}
      </div>
    );
  }

  return children;
}

/** Toast used for success / error feedback on mutations. */
export function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60] max-w-sm animate-fade-in">
      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${tones[toast.type] || tones.info}`}>
        <span className="flex-1">{toast.message}</span>
        <button type="button" onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}