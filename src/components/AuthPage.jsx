import React, { useState } from 'react';
import { 
  LogIn, UserPlus, Mail, Lock, User, 
  Sparkles, ShieldCheck, Globe, ArrowRight 
} from 'lucide-react';

/**
 * Страница авторизации: Вход / Регистрация.
 * Ультимативный редизайн VIBE: Неоновые свечения, глубокие тени и глассморфизм.
 */
export function AuthPage({ onSignIn, onSignUp, error, setError }) {
  const [mode, setMode]         = useState('login');
  const [email, setEmail]       = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    if (mode === 'login') {
      await onSignIn(email, password, rememberMe);
    } else {
      await onSignUp(email, username, password, rememberMe);
    }
    setLoading(false);
  }

  function switchMode(m) {
    setMode(m);
    setError(null);
    setEmail('');
    setUsername('');
    setPassword('');
  }

  return (
    <div className="min-h-screen bg-ds-bg flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* ── Анимированный фон (VIBE AURORA) ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-ds-accent/20 rounded-full blur-[120px] animate-vibe-pulse opacity-60 shadow-[0_0_150px_rgba(0,240,255,0.2)]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/15 rounded-full blur-[120px] animate-vibe-pulse opacity-40 shadow-[0_0_150px_rgba(147,51,234,0.15)]" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/4 right-1/4 w-[30%] h-[30%] bg-ds-accent/5 rounded-full blur-[100px] animate-vibe-pulse opacity-20" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.02)_0%,transparent_70%)]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Brand/Logo Section */}
        <div className="text-center mb-10 group cursor-default">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2.5rem] bg-ds-accent mb-6 shadow-[0_0_50px_rgba(0,240,255,0.4)] transition-all group-hover:scale-110 group-hover:rotate-[10deg] duration-500 relative">
             <div className="absolute inset-0 rounded-[2.5rem] vibe-moving-glow opacity-50" />
              <div className="bg-ds-sidebar/10 w-full h-full rounded-[2.5rem] flex items-center justify-center backdrop-blur-sm border-2 border-white/20 overflow-hidden">
                <Sparkles size={48} className="text-ds-accent vibe-logo-glow animate-vibe-pulse" />
              </div>
           </div>
           <h1 className="text-5xl font-black text-ds-text uppercase tracking-tighter leading-none mb-2">VIBE</h1>
           <div className="flex items-center justify-center gap-2">
              <span className="h-[1px] w-4 bg-ds-accent/40" />
              <p className="text-[10px] text-ds-muted font-black uppercase tracking-[0.4em]">Чат будущего уже здесь</p>
              <span className="h-[1px] w-4 bg-ds-accent/40" />
           </div>
        </div>

        {/* Auth Card */}
        <div className="bg-ds-sidebar/80 backdrop-blur-3xl rounded-[3rem] p-10 border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative group overflow-hidden">
          <div className="absolute inset-0 vibe-moving-glow opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-700" />
          
          {/* Mode Switcher */}
          <div className="flex bg-ds-bg/60 rounded-[1.5rem] p-1.5 mb-8 border border-white/5 relative z-10">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-500 flex items-center justify-center gap-2 ${mode === 'login'
                  ? 'bg-ds-accent text-black shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                  : 'text-ds-muted hover:text-ds-text'
                }`}
            >
              <LogIn size={14} strokeWidth={3} />
              Вход
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-500 flex items-center justify-center gap-2 ${mode === 'register'
                  ? 'bg-ds-accent text-black shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                  : 'text-ds-muted hover:text-ds-text'
                }`}
            >
              <UserPlus size={14} strokeWidth={3} />
              Регистрация
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              {/* Email */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 ml-2">
                   <Mail size={12} className="text-ds-accent" />
                   <label className="text-[10px] font-black text-ds-muted uppercase tracking-widest">
                     Электронная почта
                   </label>
                </div>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@vibe.app"
                  required
                  className="w-full bg-ds-bg/40 border border-white/5 rounded-2xl px-5 py-4 text-ds-text text-sm font-bold placeholder-ds-muted/30 focus:border-ds-accent/30 focus:bg-ds-bg/60 transition-all outline-none"
                />
              </div>

              {/* Username (Register only) */}
              {mode === 'register' && (
                <div className="space-y-2 animate-slide-up">
                  <div className="flex items-center gap-2 ml-2">
                     <User size={12} className="text-ds-accent" />
                     <label className="text-[10px] font-black text-ds-muted uppercase tracking-widest">
                       Твой никнейм
                     </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="CyberVibe_2026"
                      required
                      className="flex-1 bg-ds-bg/40 border border-ds-border rounded-2xl px-4 py-3 text-ds-text text-sm font-bold placeholder-ds-muted/30 focus:border-ds-accent/30 focus:bg-ds-bg/60 transition-all outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 ml-2">
                   <Lock size={12} className="text-ds-accent" />
                   <label className="text-[10px] font-black text-ds-muted uppercase tracking-widest">
                     Секретный пароль
                   </label>
                </div>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-ds-bg/40 border border-ds-border rounded-2xl px-5 py-4 text-ds-text text-sm font-bold placeholder-ds-muted/30 focus:border-ds-accent/30 focus:bg-ds-bg/60 transition-all outline-none"
                />
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between px-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-3 group cursor-pointer outline-none"
                >
                  <div className={`w-5 h-5 rounded-md border-2 transition-all duration-300 flex items-center justify-center
                    ${rememberMe 
                      ? 'bg-ds-accent border-ds-accent shadow-[0_0_10px_rgba(0,240,255,0.4)]' 
                      : 'border-ds-muted/20 bg-ds-bg/40 group-hover:border-ds-muted/40'}`}
                  >
                    {rememberMe && (
                      <svg className="w-3.5 h-3.5 text-ds-bg animate-slide-up" fill="none" stroke="currentColor" strokeWidth="4" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${rememberMe ? 'text-ds-accent' : 'text-ds-muted group-hover:text-ds-text'}`}>
                    Запомнить меня
                  </span>
                </button>
              </div>

              {/* Error Box */}
              {error && (
                <div className="bg-ds-red/10 border border-ds-red/20 rounded-2xl px-4 py-3 flex items-center gap-3 animate-fade-in">
                   <ShieldCheck size={18} className="text-ds-red flex-shrink-0" />
                   <p className="text-[11px] text-ds-red font-bold uppercase tracking-tight leading-tight">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ds-accent text-black font-black uppercase tracking-[0.2em] py-5 rounded-[1.5rem] transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(0,240,255,0.3)] vibe-glow-blue disabled:opacity-40 disabled:cursor-not-allowed mt-4 group overflow-hidden relative"
              >
                <div className="absolute inset-0 vibe-moving-glow opacity-40 group-hover:opacity-60 transition-opacity" />
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {loading ? (
                    <div className="w-5 h-5 border-[3px] border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === 'login' ? 'ВОЙТИ В VIBE' : 'СОЗДАТЬ АККАУНТ'}
                      <ArrowRight size={18} strokeWidth={3} className="group-hover:translate-x-2 transition-transform duration-500" />
                    </>
                  )}
                </span>
              </button>
          </form>

          {/* Bottom Info */}
          <div className="mt-10 text-center relative z-10">
             <p className="text-[9px] text-ds-muted font-black uppercase tracking-[0.2em]">
                {mode === 'login' ? 'Нет аккаунта? Давай создадим!' : 'Уже в системе? Тогда возвращайся!'}
             </p>
             <button 
                onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                className="text-ds-accent/60 hover:text-ds-accent text-[10px] font-black uppercase tracking-widest mt-2 transition-colors"
             >
                {mode === 'login' ? 'РЕГИСТРАЦИЯ' : 'ВХОД В СИСТЕМУ'}
             </button>
          </div>
        </div>
        
       {/* Footer info */}
        <p className="text-[9px] text-ds-muted/20 font-bold uppercase tracking-[0.3em] text-center mt-8">
           Safe • Secure • Ultra-Fast • Nash-Chat 2026
        </p>
      </div>
    </div>
  );
}
