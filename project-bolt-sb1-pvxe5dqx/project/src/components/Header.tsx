import { useState } from 'react';
import {
  BookOpen,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  Flame,
  PlusCircle,
  Archive,
  HelpCircle,
  Keyboard,
  PenTool,
  Layers,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { getStreakData } from '@/lib/storage';
import { AuthModal } from './AuthModal';
import type { TabKey } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';

interface HeaderProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const TABS: {
  key: TabKey;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  descriptionVi: string;
  descriptionEn: string;
}[] = [
  { key: 'add', labelKey: 'tabAdd', icon: PlusCircle, descriptionVi: 'Thêm từ vựng mới', descriptionEn: 'Add vocabulary' },
  { key: 'chest', labelKey: 'tabChest', icon: Archive, descriptionVi: 'Rương từ vựng cá nhân', descriptionEn: 'Vocabulary chest' },
  { key: 'quiz', labelKey: 'tabQuiz', icon: HelpCircle, descriptionVi: 'Luyện trắc nghiệm phản xạ', descriptionEn: 'Multiple choice quiz' },
  { key: 'typing', labelKey: 'tabTyping', icon: Keyboard, descriptionVi: 'Luyện gõ từ vựng', descriptionEn: 'Typing test' },
  { key: 'sentence', labelKey: 'tabSentence', icon: PenTool, descriptionVi: 'Luyện đặt câu ngữ pháp', descriptionEn: 'Sentence building' },
  { key: 'cloze', labelKey: 'tabCloze', icon: Layers, descriptionVi: 'Đục lỗ ngữ cảnh', descriptionEn: 'Cloze test' },
  { key: 'analytics', labelKey: 'tabAnalytics', icon: BarChart3, descriptionVi: 'Thống kê & Mục tiêu tuần', descriptionEn: 'Skill stats & weekly goals' },
];

export function Header({ activeTab, onTabChange }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [mobileOpen, setMobileOpen] = useState(false);
  const streak = getStreakData();

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-between h-16 gap-1 sm:gap-2">
            {/* Logo */}
            <div
              onClick={() => onTabChange('chest')}
              className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
              title="VocabMaster - Trang chủ"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform ${
                theme === 'retro'
                  ? 'bg-gradient-to-br from-amber-600 to-amber-900 border border-amber-500/40 text-amber-100'
                  : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white'
              }`}>
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className={`text-base sm:text-lg font-bold tracking-tight hidden sm:block ${theme === 'retro' ? 'font-serif text-amber-950' : 'text-slate-800'}`}>
                VocabMaster
              </span>
            </div>

            {/* Desktop Tabs: always centered, 1 line, no scrollbar, never overflows */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 flex-1 justify-center no-scrollbar px-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => onTabChange(tab.key)}
                    title={lang === 'vi' ? tab.descriptionVi : tab.descriptionEn}
                    className={`flex items-center gap-1 px-2 xl:px-2.5 py-1.5 rounded-xl text-xs xl:text-sm font-semibold whitespace-nowrap transition-all duration-150 shrink-0 select-none ${
                      isActive
                        ? (theme === 'retro'
                            ? 'bg-amber-200/90 text-amber-950 border border-amber-300 font-bold shadow-2xs'
                            : 'bg-sky-50 text-sky-700 shadow-xs border border-sky-200/80 font-bold')
                        : (theme === 'retro'
                            ? 'text-stone-700 hover:text-stone-950 hover:bg-amber-100/70'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80')
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0 ${
                      isActive
                        ? (theme === 'retro' ? 'text-amber-800' : 'text-sky-600')
                        : (theme === 'retro' ? 'text-amber-700/60' : 'text-slate-400')
                    }`} />
                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right side: Ultra-compact, sleek, never squeezes the tabs */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Theme Switcher Button: 35mm Cinema Dark / Retro Paper / Modern */}
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-r from-stone-900 via-neutral-900 to-amber-950 text-amber-300 border-amber-500/50 shadow-md hover:border-amber-400'
                    : theme === 'retro'
                    ? 'bg-amber-100/90 text-amber-900 border-amber-300/90 shadow-2xs hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
                }`}
                title={
                  theme === 'cinema'
                    ? 'Giao diện: 35mm Film Cinema (Bấm để chuyển sang Retro Sổ tay)'
                    : theme === 'retro'
                    ? 'Giao diện: Retro Sổ tay (Bấm để sang Hiện đại)'
                    : 'Giao diện: Hiện đại (Bấm để sang 35mm Cinema)'
                }
              >
                <span className="text-xs">
                  {theme === 'cinema' ? '🎞️' : theme === 'retro' ? '📜' : '☀️'}
                </span>
                <span className="hidden sm:inline text-[11px] font-mono">
                  {theme === 'cinema' ? '35mm Reel' : theme === 'retro' ? 'Paper' : 'Modern'}
                </span>
                {theme === 'cinema' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="REC Active" />
                )}
              </button>

              {/* Daily Streak Badge */}
              <button
                onClick={() => onTabChange('analytics')}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-900 hover:border-amber-300 hover:shadow-xs transition-all cursor-pointer shrink-0"
                title={lang === 'vi' ? `Chuỗi học tập: ${streak.currentStreak} ngày liên tiếp!` : `Study streak: ${streak.currentStreak} days in a row!`}
              >
                <Flame className={`w-3.5 h-3.5 ${streak.currentStreak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-orange-700">{streak.currentStreak}</span>
              </button>

              {/* Language Toggle */}
              <button
                onClick={toggleLang}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200/70 transition-colors shrink-0"
                title="Đổi ngôn ngữ (EN / VI)"
              >
                <span className="text-xs leading-none">{lang === 'en' ? '🇬🇧' : '🇻🇳'}</span>
                <span className="text-[11px] uppercase tracking-wide hidden xl:inline">{lang}</span>
              </button>

              {/* Auth */}
              {user ? (
                <div className="flex items-center gap-1 shrink-0">
                  <div
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded-xl bg-slate-100/90 border border-slate-200/60 shrink-0"
                    title={user.email || ''}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 to-sky-500 flex items-center justify-center text-white text-[10px] font-bold shadow-2xs">
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <span className="text-xs font-medium text-slate-700 max-w-[80px] xl:max-w-[110px] truncate hidden 2xl:inline">
                      {user.email}
                    </span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    title={t('logout')}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openAuth('login')}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => openAuth('signup')}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 transition-all shadow-xs"
                  >
                    {t('signUp')}
                  </button>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white">
            <nav className="px-4 py-3 space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      onTabChange(tab.key);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 font-bold border border-sky-100'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                    <span>{t(tab.labelKey)}</span>
                    <span className="text-xs text-slate-400 font-normal ml-auto">
                      {lang === 'vi' ? tab.descriptionVi : tab.descriptionEn}
                    </span>
                  </button>
                );
              })}
              {!user && (
                <div className="pt-2 border-t border-slate-100 flex gap-2">
                  <button
                    onClick={() => { openAuth('login'); setMobileOpen(false); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100"
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => { openAuth('signup'); setMobileOpen(false); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-teal-500"
                  >
                    {t('signUp')}
                  </button>
                </div>
              )}
              {user && (
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2 px-4 py-2">
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600 truncate flex-1">{user.email}</span>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      <AuthModal open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
    </>
  );
}

