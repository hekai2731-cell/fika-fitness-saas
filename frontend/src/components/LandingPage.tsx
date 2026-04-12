import { useEffect, useState } from 'react';
import { LAST_LOGIN_KEY } from '@/hooks/useAuth';

type LastLoginData = {
  remember: boolean;
  roadCode?: string;
  coachCode?: string;
};

export function LandingPage({
  display,
  onStudentLogin,
  onCoachLogin,
  onAdminLogin,
}: {
  display: 'flex' | 'none';
  onStudentLogin: (roadCode: string, remember: boolean) => Promise<boolean>;
  onCoachLogin: (coachCode: string, remember: boolean) => boolean;
  onAdminLogin: (pass: string, remember: boolean) => boolean;
}) {
  const [roadCode, setRoadCode] = useState('');
  const [coachCode, setCoachCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [stuError, setStuError] = useState('');
  const [coachError, setCoachError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_LOGIN_KEY);
      if (!saved) return;
      const last = JSON.parse(saved) as LastLoginData;
      if (last.roadCode) setRoadCode(String(last.roadCode).toUpperCase());
      if (last.coachCode) setCoachCode(String(last.coachCode).toUpperCase());
      if (typeof last.remember === 'boolean') setRememberDevice(last.remember);
    } catch {
      // ignore
    }
  }, []);

  const handleStudentLogin = async () => {
    const code = roadCode.trim().toUpperCase();
    if (!code) { setStuError('请输入路书码'); return; }
    try {
      const ok = await onStudentLogin(code, rememberDevice);
      if (!ok) setStuError('路书码无效，请检查后重试');
      else setStuError('');
    } catch (error) {
      setStuError('登录失败，请重试');
      console.error('[app] Student login error:', error);
    }
  };

  const handleCoachLogin = () => {
    const code = coachCode.trim().toUpperCase();
    if (!code) { setCoachError('请输入教练码'); return; }
    const ok = onCoachLogin(code, rememberDevice);
    if (!ok) setCoachError('教练码无效，请检查后重试');
    else setCoachError('');
  };

  const handleAdminLogin = () => {
    const pass = prompt('请输入管理员密码：');
    if (pass === null) return;
    const ok = onAdminLogin(pass, rememberDevice);
    if (!ok) alert('密码错误');
  };

  return (
    <div id="pg-landing" className="z1" style={{ display }}>
      <div style={{ textAlign: 'center' }}>
        <div className="landing-logo">
          <span style={{ color: 'var(--p)', fontWeight: 900, fontSize: 36 }}>Fi</span>
          <span style={{ fontWeight: 900, fontSize: 36, color: 'var(--s900)' }}>KA</span>
        </div>
        <div className="landing-brand">Fitness · 身体资产运维中心</div>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 380, overflow: 'hidden' }}>
        {/* 学员登录 */}
        <div style={{ padding: '28px 26px' }}>
          <div style={{ width: 44, height: 3, background: 'var(--p)', borderRadius: 2, margin: '0 auto 22px' }} />
          <div style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', color: 'var(--s900)', letterSpacing: '-.02em' }}>
            FiKA 身体资产运维中心
          </div>
          <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--s400)', textAlign: 'center', marginTop: 4 }}>
            BODY ASSET OPERATIONS CENTER
          </div>

          <div style={{ marginTop: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', display: 'block', marginBottom: 2 }}>路书码</span>
            <span style={{ fontSize: 10, color: 'var(--s400)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              ROADBOOK CODE
            </span>
            <input
              className="stu-roadbook-inp"
              placeholder="FiKA-WF001"
              value={roadCode}
              onChange={(e) => { setRoadCode(e.target.value.toUpperCase()); setStuError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStudentLogin(); }}
            />
            {stuError && <div style={{ color: 'var(--r)', fontSize: 11, marginTop: 4, textAlign: 'center' }}>{stuError}</div>}
            <div style={{ fontSize: 11, color: 'var(--s400)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
              请输入您的个人路书码以同步今日训练计划
              <br />
              <span style={{ fontSize: 10 }}>Please enter your code to sync today's session.</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--p)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--s600)' }}>在本设备上保持运维状态</span>
            </label>
            <button className="stu-login-btn" onClick={handleStudentLogin}>
              开始运维 →
            </button>
          </div>
        </div>

        {/* 教练登录 */}
        <div style={{ borderTop: '1px solid var(--s100)', padding: '16px 26px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>教练登录</div>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--s400)', marginTop: 2 }}>COACH LOGIN</div>
          <input
            className="inp"
            placeholder="教练码 COACH001"
            value={coachCode}
            onChange={(e) => { setCoachCode(e.target.value.toUpperCase()); setCoachError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCoachLogin(); }}
            style={{ marginTop: 10 }}
          />
          {coachError && <div style={{ color: 'var(--r)', fontSize: 11, marginTop: 4 }}>{coachError}</div>}
          <button className="btn btn-o" style={{ width: '100%', marginTop: 8, fontSize: 13 }} onClick={handleCoachLogin}>
            进入教练台
          </button>
        </div>

        {/* 管理员 */}
        <div style={{ borderTop: '1px solid var(--s100)', padding: '14px 26px', textAlign: 'center' }}>
          <button className="btn-ghost btn" style={{ fontSize: 12, color: 'var(--s500)' }} onClick={handleAdminLogin}>
            管理员入口 Admin
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '0 0 14px' }}>
          <span style={{ fontSize: 11, color: 'var(--p)', cursor: 'pointer' }}>找不到路书码？获取帮助 Get Help</span>
        </div>
      </div>
    </div>
  );
}
