import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.Event = dom.window.Event;

const ORIGIN = 'http://localhost:5173';
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) =>
  realFetch(typeof url === 'string' && url.startsWith('/') ? ORIGIN + url : url, opts);

const c = await import('../src/api/client.js');
let fired = 0;
dom.window.addEventListener(c.UNAUTHORIZED_EVENT, () => { fired += 1; });

// 1. good token -> no clear
c.setToken('good.jwt.token');
try { await c.api.get('/health'); } catch {}
console.log('after /health  -> token kept:', !!c.getToken(), '| events:', fired);

// 2. real protected endpoint with a bad token -> server replies 401
c.setToken('invalid.jwt.value');
try { await c.api.get('/api/tasks'); } catch (e) { console.log('request failed with status', e.status); }
console.log('after /api/tasks (401) -> token cleared:', c.getToken() === null, '| events:', fired);

// 3. wrong password must NOT emit the event (would loop on /login)
c.setToken('some.token');
try { await c.authApi.login('admin@smartworkforce.com', 'WrongPassword!'); } catch (e) { console.log('login failed with status', e.status); }
console.log('after bad login -> events:', fired, '(must stay 1)');