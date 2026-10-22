import { useState, useEffect } from 'react';
import { X, Mail, Lock, BookOpen, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import type { TranslationKey } from '@/lib/i18n';

type AuthMode = 'login' | 'signup' | 'reset';

interface AuthModalProps {
  open: boolean;
  initialMode: AuthMode;
  onClose: () => void;
}

export function AuthModal({ open, initialMode, onClose }: AuthModalProps) {
  const { signIn, signUp, resetPassword } = useAuth();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
      setEmail('');
      setPassword('');
    }
  }, [open, initialMode]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setError(t('errEmailRequired'));
      return;
    }
    if (mode !== 'reset' && !password) {
      setError(t('errPasswordRequired'));
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError(t('errPasswordsTooShort'));
      return;
    }

    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        setError(t('errInvalidCredentials'));
      } else {
        onClose();
      }
    } else if (mode === 'signup') {
      const { error } = await signUp(email.trim(), password);
      if (error) {
        if (error.toLowerCase().includes('already') || error.toLowerCase().includes('registered')) {
          setError(t('errEmailInUse'));
        } else if (error.toLowerCase().includes('password') || error.toLowerCase().includes('weak')) {
          setError(t('errWeakPassword'));
        } else {
          setError(error);
        }
      } else {
        setSuccessMsg(t('checkEmailConfirm'));
      }
    } else {
      const { error } = await resetPassword(email.trim());
      if (error) {
        setError(error);
      } else {
        setSuccessMsg(t('errResetSent'));
      }
    }
    setLoading(false);
  };

  const titles: Record<AuthMode, TranslationKey> = {
    login: 'welcomeBack',
    signup: 'joinNow',
    reset: 'resetPassword',
  };
  const subtitles: Record<AuthMode, TranslationKey> = {
    login: 'authSubtitle',
    signup: 'signUpSubtitle',
    reset: 'resetSubtitle',
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in border ${
        theme === 'cinema'
          ? 'bg-[#18130e] border-amber-500/40 text-amber-100 shadow-black/80'
          : 'bg-white border-slate-200'
      }`}>
        {/* Header */}
        <div className={`relative px-8 pt-8 pb-6 ${
          theme === 'cinema'
            ? 'bg-gradient-to-r from-stone-900 via-neutral-900 to-amber-950 border-b border-amber-500/30 text-amber-100'
            : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white'
        }`}>
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 transition-colors cursor-pointer ${
              theme === 'cinema' ? 'text-amber-300/80 hover:text-amber-100' : 'text-white/80 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className={`w-7 h-7 ${theme === 'cinema' ? 'text-amber-400' : 'text-white'}`} />
            <span className={`text-xl font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-white'}`}>
              {t('appName')}
            </span>
          </div>
          <h2 className={`text-2xl font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-white'}`}>
            {t(titles[mode])}
          </h2>
          <p className={`text-sm mt-1 ${theme === 'cinema' ? 'text-stone-300' : 'text-white/80'}`}>
            {t(subtitles[mode])}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {error && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${
              theme === 'cinema'
                ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              {error}
            </div>
          )}
          {successMsg && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${
              theme === 'cinema'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              {successMsg}
            </div>
          )}

          <div>
            <label className={`block text-sm font-semibold mb-1.5 ${
              theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
            }`}>
              {t('email')}
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
                theme === 'cinema' ? 'text-stone-500' : 'text-slate-400'
              }`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-11 pr-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                  theme === 'cinema'
                    ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                    : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                }`}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className={`block text-sm font-semibold mb-1.5 ${
                theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
              }`}>
                {t('password')}
              </label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  theme === 'cinema' ? 'text-stone-500' : 'text-slate-400'
                }`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                  }`}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold transition-all shadow-md disabled:opacity-60 cursor-pointer ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400 shadow-amber-950/40'
                : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-sky-500/20'
            }`}
          >
            {loading ? t('loading') : mode === 'login' ? t('login') : mode === 'signup' ? t('createAccount') : t('sendResetLink')}
          </button>

          {/* Links */}
          <div className="text-center space-y-2 pt-2">
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(null); setSuccessMsg(null); }}
                  className={`text-sm font-medium ${
                    theme === 'cinema' ? 'text-amber-400 hover:text-amber-300' : 'text-sky-600 hover:text-sky-700'
                  }`}
                >
                  {t('forgotPassword')}
                </button>
                <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>
                  {t('noAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null); }}
                    className={`font-semibold ${
                      theme === 'cinema' ? 'text-amber-400 hover:text-amber-300' : 'text-sky-600 hover:text-sky-700'
                    }`}
                  >
                    {t('signUp')}
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>
                {t('haveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                  className={`font-semibold ${
                    theme === 'cinema' ? 'text-amber-400 hover:text-amber-300' : 'text-sky-600 hover:text-sky-700'
                  }`}
                >
                  {t('login')}
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                  className={`font-semibold ${
                    theme === 'cinema' ? 'text-amber-400 hover:text-amber-300' : 'text-sky-600 hover:text-sky-700'
                  }`}
                >
                  {t('backToLogin')}
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
