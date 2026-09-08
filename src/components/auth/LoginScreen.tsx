import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('تعذر الاتصال بـ Supabase، تحقق من مفاتيح الربط.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        } else {
          setErrorMsg(error.message);
        }
      } else if (data?.session) {
        localStorage.setItem('elmallah_admin_auth_token', data.session.access_token);
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070b14] text-slate-100 flex items-center justify-center p-4 selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-[#0d1424]/90 border border-slate-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-4 text-cyan-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">لوحة التحكم</h1>
            <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1.5">
              <span>الملاح لبيع الأسماك</span>
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5 break-all">
              <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">البريد الإلكتروني</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="admin@domain.com"
                  required
                />
                <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 pr-10 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="••••••••"
                  required
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-3.5 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-3 px-4 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>جاري الدخول...</span>
              ) : (
                <>
                  <span>تسجيل الدخول</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
