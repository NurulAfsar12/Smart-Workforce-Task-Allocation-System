import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout';
import { Spinner } from './components/ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyTasks from './pages/MyTasks';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Allocation from './pages/Allocation';
import Workload from './pages/Workload';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Departments from './pages/Departments';
import Skills from './pages/Skills';
import Projects from './pages/Projects';
import Reports from './pages/Reports';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-400">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

/** Blocks a route until a session exists (and the role is allowed). */
function Protected({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return children;
}

function AdminOnly({ children }) {
  return <Protected adminOnly>{children}</Protected>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />

          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="my-tasks" element={<MyTasks />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="allocation" element={<AdminOnly><Allocation /></AdminOnly>} />
            <Route path="workload" element={<Workload />} />
            <Route path="projects" element={<Projects />} />
            <Route path="employees" element={<AdminOnly><Employees /></AdminOnly>} />
            <Route path="employees/:id" element={<EmployeeDetail />} />
            <Route path="departments" element={<AdminOnly><Departments /></AdminOnly>} />
            <Route path="skills" element={<AdminOnly><Skills /></AdminOnly>} />
            <Route path="reports" element={<AdminOnly><Reports /></AdminOnly>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}