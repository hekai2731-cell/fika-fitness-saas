/**
 * App.tsx — 路由壳子
 * 登录/会话/初始化 → useAuth hook
 * 登录页 UI        → LandingPage component
 * 教练端           → CoachPortal
 * 学员端           → StudentPortal
 * 管理端           → AdminPortal
 */

import { useMemo } from 'react';
import { LandingPage } from './components/LandingPage';
import { StudentPortal } from './components/student/StudentPortal';
import { AdminPortal } from './components/admin/AdminPortal';
import { CoachPortal } from './pages/CoachPortal';
import { useAuth } from './hooks/useAuth';

function Background() {
  return (
    <div className="bg">
      <div className="bg-a" />
      <div className="bg-b" />
      <div className="bg-c" />
    </div>
  );
}

function App() {
  const {
    page, currentStudent, currentCoachCode, isInitializing,
    handleStudentLogin, handleCoachLogin, handleAdminLogin, handleLogout,
  } = useAuth();

  const display = useMemo(() => ({
    landing: page === 'landing' ? ('flex' as const) : ('none' as const),
    student: page === 'student' ? ('block' as const) : ('none' as const),
    coach:   page === 'coach'   ? ('block' as const) : ('none' as const),
    admin:   page === 'admin'   ? ('block' as const) : ('none' as const),
  }), [page]);

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '20px', color: '#666' }}>正在加载数据...</div>
          <div style={{ width: '40px', height: '40px', border: '4px solid #ddd', borderTop: '4px solid #4CAF50', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <>
      <Background />
      <LandingPage
        display={display.landing}
        onStudentLogin={handleStudentLogin}
        onCoachLogin={handleCoachLogin}
        onAdminLogin={handleAdminLogin}
      />
      <StudentPortal display={display.student} onLogout={handleLogout} client={currentStudent as any} />
      <CoachPortal   display={display.coach}   onLogout={handleLogout} coachCode={currentCoachCode} />
      <AdminPortal   display={display.admin}   onLogout={handleLogout} />
    </>
  );
}

export default App;
