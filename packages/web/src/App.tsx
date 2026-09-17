import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { MyTasks } from './pages/MyTasks';
import { TaskDetail } from './pages/TaskDetail';
import { StudentDetail } from './pages/StudentDetail';
import { Timetable } from './pages/Timetable';
import { Students } from './pages/Students';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<MyTasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="students" element={<Students />} />
        <Route path="timetable" element={<Timetable />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
