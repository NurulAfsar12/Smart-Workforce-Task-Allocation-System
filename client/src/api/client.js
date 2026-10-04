const TOKEN_KEY = 'sw_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/**
 * Thin fetch wrapper around the Express API.
 * Attaches the JWT, parses JSON and turns any non 2xx response into a
 * thrown Error carrying the server message, so components can rely on
 * a single error shape.
 */
async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  const token = getToken();
  const res = await fetch(url.pathname + url.search, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!res.ok) {
    const error = new Error(payload.message || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.details = payload.details;
    error.reason = payload.reason;
    throw error;
  }

  return payload;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};

// --- endpoint helpers grouped by resource -------------------------
export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  me: () => api.get('/api/auth/me'),
};

export const departmentsApi = {
  list: () => api.get('/api/departments'),
  create: (body) => api.post('/api/departments', body),
  update: (id, body) => api.put(`/api/departments/${id}`, body),
  remove: (id) => api.delete(`/api/departments/${id}`),
};

export const skillsApi = {
  list: (params) => api.get('/api/skills', params),
  get: (id) => api.get(`/api/skills/${id}`),
  create: (body) => api.post('/api/skills', body),
  update: (id, body) => api.put(`/api/skills/${id}`, body),
  remove: (id) => api.delete(`/api/skills/${id}`),
};

export const employeesApi = {
  list: (params) => api.get('/api/employees', params),
  get: (id) => api.get(`/api/employees/${id}`),
  create: (body) => api.post('/api/employees', body),
  update: (id, body) => api.put(`/api/employees/${id}`, body),
  remove: (id) => api.delete(`/api/employees/${id}`),
  addSkill: (id, body) => api.post(`/api/employees/${id}/skills`, body),
  removeSkill: (id, skillId) => api.delete(`/api/employees/${id}/skills/${skillId}`),
  addAvailability: (id, body) => api.post(`/api/employees/${id}/availability`, body),
  removeAvailability: (id, avId) => api.delete(`/api/employees/${id}/availability/${avId}`),
  tasks: (id) => api.get(`/api/employees/${id}/tasks`),
};

export const projectsApi = {
  list: (params) => api.get('/api/projects', params),
  get: (id) => api.get(`/api/projects/${id}`),
  create: (body) => api.post('/api/projects', body),
  update: (id, body) => api.put(`/api/projects/${id}`, body),
  remove: (id) => api.delete(`/api/projects/${id}`),
};

export const tasksApi = {
  list: (params) => api.get('/api/tasks', params),
  get: (id) => api.get(`/api/tasks/${id}`),
  create: (body) => api.post('/api/tasks', body),
  update: (id, body) => api.put(`/api/tasks/${id}`, body),
  remove: (id) => api.delete(`/api/tasks/${id}`),
  allocate: (id, body) => api.post(`/api/tasks/${id}/allocate`, body ?? {}),
  assign: (id, employeeId, body) => api.post(`/api/tasks/${id}/assign`, { employee_id: employeeId, ...body }),
  release: (id, note) => api.post(`/api/tasks/${id}/release`, { note }),
  transition: (id, status, remarks) => api.post(`/api/tasks/${id}/transition`, { status, remarks }),
  candidates: (id) => api.get(`/api/tasks/${id}/candidates`),
  setSkills: (id, skills) => api.put(`/api/tasks/${id}/skills`, { skills }),
  logs: (id) => api.get(`/api/tasks/${id}/logs`),
  addLog: (id, body) => api.post(`/api/tasks/${id}/logs`, body),
  deleteLog: (id, logId) => api.delete(`/api/tasks/${id}/logs/${logId}`),
  addComment: (id, body) => api.post(`/api/tasks/${id}/comments`, { body }),
  history: (id) => api.get(`/api/tasks/${id}/history`),
};

export const allocationApi = {
  pending: () => api.get('/api/allocation/pending'),
  preview: (taskId) => api.get(`/api/allocation/preview/${taskId}`),
  run: (projectId) => api.post('/api/allocation/run', { project_id: projectId }),
  log: (params) => api.get('/api/allocation/log', params),
  explain: (taskId, employeeId) => api.get(`/api/allocation/explain/${taskId}/${employeeId}`),
};

export const workloadApi = {
  list: (params) => api.get('/api/workload', params),
  employee: (id) => api.get(`/api/workload/${id}`),
  heatmap: (days) => api.get('/api/workload/heatmap', { days }),
  distribution: () => api.get('/api/workload/distribution'),
};

export const reportsApi = {
  dashboard: () => api.get('/api/reports/dashboard'),
  workload: () => api.get('/api/reports/workload'),
  projects: () => api.get('/api/reports/projects'),
  skills: () => api.get('/api/reports/skills'),
  performance: () => api.get('/api/reports/performance'),
  deadlineRisk: () => api.get('/api/reports/deadline-risk'),
  allocationLog: (params) => api.get('/api/reports/allocation-log', params),
  effort: (days) => api.get('/api/reports/effort', { days }),
};