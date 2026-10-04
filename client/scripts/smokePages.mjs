/**
 * Runtime smoke test for the React pages.
 *
 * Mounts every route in a real DOM (jsdom) against the LIVE Express API, lets
 * effects and requests settle, and fails on any thrown error. This catches the
 * class of bugs a production build cannot: undefined variables, wrong property
 * names, null dereferences on first paint, and hook misuse.
 *
 *   node scripts/smokePages.mjs
 */
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const API = process.env.API_URL || 'http://localhost:5000';
const CLIENT_SRC = join(process.cwd(), 'src');
const SETTLE_MS = Number(process.env.SETTLE_MS || 2500);

// ---------------------------------------------------------------------------
// 1. Log in so requests made by the pages are authenticated.
// ---------------------------------------------------------------------------
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@smartworkforce.com', password: 'Password123!' }),
});
if (!loginRes.ok) {
  console.error('Cannot log in. Is the API running and seeded?');
  process.exit(1);
}
const { token } = await loginRes.json();

const callLog = [];
const realFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// 2. Compile the whole client into one bundle (single entry => one instance of
//    every module, so contexts are shared exactly as in the real app).
// ---------------------------------------------------------------------------
const esbuild = await import(
  pathToFileURL(join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href
);
const outDir = join(process.cwd(), '.smoke-build');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const PAGE_NAMES = [
  'Login', 'Dashboard', 'MyTasks', 'Tasks', 'TaskDetail', 'Allocation',
  'Workload', 'Projects', 'Employees', 'EmployeeDetail', 'Departments',
  'Skills', 'Reports',
];

const entry = join(outDir, '__entry.jsx');
writeFileSync(
  entry,
  [
    `export { AuthProvider } from ${JSON.stringify(join(CLIENT_SRC, 'context/AuthContext.jsx'))};`,
    `export { default as Layout } from ${JSON.stringify(join(CLIENT_SRC, 'components/layout.jsx'))};`,
    ...PAGE_NAMES.map(
      (n) => `export { default as ${n} } from ${JSON.stringify(join(CLIENT_SRC, `pages/${n}.jsx`))};`
    ),
  ].join('\n'),
  'utf8'
);

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: true,
  outfile: join(outDir, 'bundle.mjs'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2022',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  // React must stay external so the pages share the one copy in node_modules
  // with react-dom; two copies break hooks.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-router', 'react-router-dom'],
  define: { 'process.env.NODE_ENV': '"development"' },
});

// ---------------------------------------------------------------------------
// 3. Install a real DOM before React DOM is imported.
// ---------------------------------------------------------------------------
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});

const { window } = dom;
window.localStorage.setItem('sw_token', token);
window.confirm = () => true;

globalThis.window = window;
globalThis.document = window.document;
// navigator is a getter-only global on modern node, so it must be redefined.
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true,
});
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.location = window.location;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The client calls relative URLs through the Vite proxy; point them at the API.
globalThis.fetch = async (url, options = {}) => {
  const target = String(url).startsWith('http') ? String(url) : `${API}${url}`;
  callLog.push(target.replace(API, ''));
  const res = await realFetch(target, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    body: options.body,
  });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
};

// Surface anything React logs instead of silently swallowing it.
const consoleErrors = [];
for (const level of ['error', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const msg = args.map(String).join(' ');
    if (
      /useLayoutEffect does nothing on the server|ReactDOMTestUtils|not wrapped in act|React Router Future Flag Warning/.test(
        msg
      )
    ) {
      return;
    }
    original(...args);
  };
}

const { createRoot } = await import('react-dom/client');
const { default: React, act } = await import('react');
const { MemoryRouter, Routes, Route, Navigate } = await import('react-router-dom');
const {
  AuthProvider, Layout, Login, Dashboard, MyTasks, Tasks, TaskDetail,
  Allocation, Workload, Projects, Employees, EmployeeDetail, Departments,
  Skills, Reports,
} = await import(pathToFileURL(join(outDir, 'bundle.mjs')).href);

const e = React.createElement;

/** Reproduces App.jsx's route tree, minus the BrowserRouter.
 *  The single MemoryRouter is supplied by the caller so the path under test
 *  can be seeded per route. */
function Harness() {
  return e(
    AuthProvider,
    null,
    e(
      Routes,
      null,
      e(Route, { path: '/login', element: e(Login) }),
      e(
        Route,
        { element: e(Layout) },
        e(Route, { index: true, element: e(Dashboard) }),
        e(Route, { path: 'my-tasks', element: e(MyTasks) }),
        e(Route, { path: 'tasks', element: e(Tasks) }),
        e(Route, { path: 'tasks/:id', element: e(TaskDetail) }),
        e(Route, { path: 'allocation', element: e(Allocation) }),
        e(Route, { path: 'workload', element: e(Workload) }),
        e(Route, { path: 'projects', element: e(Projects) }),
        e(Route, { path: 'employees', element: e(Employees) }),
        e(Route, { path: 'employees/:id', element: e(EmployeeDetail) }),
        e(Route, { path: 'departments', element: e(Departments) }),
        e(Route, { path: 'skills', element: e(Skills) }),
        e(Route, { path: 'reports', element: e(Reports) }),
        e(Route, { path: '*', element: e(Navigate, { to: '/' }) })
      )
    )
  );
}

// ---------------------------------------------------------------------------
// 4. Mount each route, let requests settle, inspect the DOM.
// ---------------------------------------------------------------------------
const ROUTES = [
  ['/', 'Dashboard', ['Welcome back', 'Active employees']],
  ['/my-tasks', 'MyTasks', ['My Tasks']],
  ['/tasks', 'Tasks', ['Tasks', 'Task']],
  ['/tasks/2', 'TaskDetail', ['Effort', 'Status']],
  ['/allocation', 'Allocation', ['Pending']],
  ['/allocation?task=3', 'Allocation + task', ['Pending']],
  ['/workload', 'Workload', ['Utilisation', 'Workload']],
  ['/projects', 'Projects', ['Projects']],
  ['/employees', 'Employees', ['Employees', 'Employee']],
  ['/employees/3', 'EmployeeDetail', ['Skills']],
  ['/departments', 'Departments', ['Departments']],
  ['/skills', 'Skills', ['Skills']],
  ['/reports', 'Reports', ['Reports']],
  ['/login', 'Login', ['Sign in']],
];

const container = window.document.getElementById('root');
let root = null;
let failures = 0;

console.log(`\nMounting ${ROUTES.length} routes against ${API}\n`);

for (const [path, name, expect] of ROUTES) {
  const before = callLog.length;
  consoleErrors.length = 0;
  let thrown = null;

  try {
    if (root) await act(async () => root.unmount());
    container.innerHTML = '';

    // Fresh router per route, seeded with the path under test.
    root = createRoot(container);
    await act(async () => {
      root.render(e(MemoryRouter, { initialEntries: [path] }, e(Harness)));
    });

    // Let useEffect chains and their fetches finish. Wait until the request
    // count has been stable for several rounds, so a slow response is not
    // mistaken for a finished render.
    const deadline = Date.now() + SETTLE_MS;
    let stableRounds = 0;
    let lastCount = -1;
    while (Date.now() < deadline) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 80));
      });
      if (callLog.length === lastCount) {
        stableRounds += 1;
        if (stableRounds >= 4) break;
      } else {
        stableRounds = 0;
        lastCount = callLog.length;
      }
    }
  } catch (err) {
    thrown = err;
  }

  const html = container.innerHTML;
  const text = container.textContent || '';
  const requests = callLog.slice(before);
  const stillLoading = text.includes('Loading data...');

  if (thrown) {
    failures += 1;
    console.log(`FAIL  ${path.padEnd(22)} ${name}`);
    console.log(`      ${String(thrown.message || thrown).split('\n')[0]}`);
    if (process.env.VERBOSE) console.log(`      ${(thrown.stack || '').split('\n').slice(1, 4).join('\n      ')}`);
  } else if (consoleErrors.length) {
    failures += 1;
    console.log(`FAIL  ${path.padEnd(22)} ${name}`);
    console.log(`      console: ${consoleErrors[0].split('\n')[0].slice(0, 160)}`);
  } else if (stillLoading) {
    failures += 1;
    console.log(`FAIL  ${path.padEnd(22)} ${name}`);
    console.log(`      still showing a loading state after ${SETTLE_MS}ms (${requests.length} requests)`);
  } else {
    const missing = expect.filter((t) => !text.includes(t));
    if (missing.length) {
      failures += 1;
      console.log(`FAIL  ${path.padEnd(22)} ${name}`);
      console.log(`      missing expected text: ${missing.join(', ')}`);
    } else {
      console.log(
        `PASS  ${path.padEnd(22)} ${name.padEnd(18)} ${String(html.length).padStart(7)} bytes  ${String(requests.length).padStart(2)} requests`
      );
    }
  }
}

if (root) await act(async () => root.unmount());

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} routes rendered cleanly.`);
console.log(`${callLog.length} API requests issued.\n`);
process.exit(failures > 0 ? 1 : 0);
