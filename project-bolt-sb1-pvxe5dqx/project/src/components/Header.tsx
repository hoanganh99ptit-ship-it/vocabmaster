import { useState, useEffect } from 'react';
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
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { getStreakData } from '@/lib/storage';
import { isSoundEnabled, toggleSound } from '@/lib/soundEffects';
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
  const [sfxEnabled, setSfxEnabled] = useState(() => isSoundEnabled());
  const streak = getStreakData();

  useEffect(() => {
    const handleSfxChange = (e: Event) => {
      const ce = e as CustomEvent<{ enabled: boolean }>;
      setSfxEnabled(ce.detail?.enabled ?? isSoundEnabled());
    };
    window.addEventListener('vocabmaster_sfx_toggle', handleSfxChange);
    return () => window.removeEventListener('vocabmaster_sfx_toggle', handleSfxChange);
  }, []);

  const handleToggleSound = () => {
    const next = toggleSound();
    setSfxEnabled(next);
  };

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-200 ${
        theme === 'cinema'
          ? 'bg-[#120e0b]/95 border-amber-500/30 text-amber-100 shadow-md shadow-black/50'
          : theme === 'retro'
          ? 'bg-[#fdfaf4]/95 border-[#ebd8c2] text-amber-950 shadow-2xs'
          : 'bg-white/95 border-slate-200/90 text-slate-800 shadow-2xs'
      }`}>
        <div className="max-w-[1440px] mx-auto px-2 sm:px-4">
          <div className="flex items-center justify-between h-16 gap-1 sm:gap-2">
            {/* Logo */}
            <div
              onClick={() => onTabChange('chest')}
              className="flex items-center gap-2 flex-shrink-0 cursor-pointer group"
              title="VocabMaster - Trang chủ"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform ${
                theme === 'cinema'
                  ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-stone-950 border border-amber-400/50 shadow-sm'
                  : theme === 'retro'
                  ? 'bg-gradient-to-br from-amber-600 to-amber-900 border border-amber-500/40 text-amber-100'
                  : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white'
              }`}>
                <BookOpen className={`w-4 h-4 ${theme === 'cinema' ? 'text-stone-950' : 'text-white'}`} />
              </div>
              <span className={`text-base sm:text-lg font-bold tracking-tight block ${
                theme === 'cinema'
                  ? 'font-serif text-amber-200'
                  : theme === 'retro'
                  ? 'font-serif text-amber-950'
                  : 'text-slate-800'
              }`}>
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
                        ? (theme === 'cinema'
                            ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-stone-950 border border-amber-400 font-black shadow-sm'
                            : theme === 'retro'
                            ? 'bg-amber-200/90 text-amber-950 border border-amber-300 font-bold shadow-2xs'
                            : 'bg-sky-50 text-sky-700 shadow-xs border border-sky-200/80 font-bold')
                        : (theme === 'cinema'
                            ? 'text-amber-200/80 hover:text-amber-100 hover:bg-[#221a14]'
                            : theme === 'retro'
                            ? 'text-stone-700 hover:text-stone-950 hover:bg-amber-100/70'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80')
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0 ${
                      isActive
                        ? (theme === 'cinema' ? 'text-stone-950' : theme === 'retro' ? 'text-amber-800' : 'text-sky-600')
                        : (theme === 'cinema' ? 'text-amber-400/80' : theme === 'retro' ? 'text-amber-700/60' : 'text-slate-400')
                    }`} />
                    <span>{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Theme Switcher Button: Visible on sm+, on mobile it's neatly placed inside drawer menu */}
              <button
                onClick={toggleTheme}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-r from-stone-900 via-neutral-900 to-amber-950 text-amber-300 border-amber-500/50 shadow-md hover:border-amber-400'
                    : theme === 'retro'
                    ? 'bg-amber-100/90 text-amber-900 border-amber-300/90 shadow-2xs hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80'
                }`}
                title={
                  theme === 'cinema'
                    ? 'Giao diện: 35mm Film Cinema (Tối) - Bấm để chuyển sang Retro Sổ tay'
                    : theme === 'retro'
                    ? 'Giao diện: Retro Sổ tay (Bấm để sang Hiện đại)'
                    : 'Giao diện: Hiện đại (Bấm để sang 35mm Cinema Tối)'
                }
              >
                <span className="text-xs">
                  {theme === 'cinema' ? '🎞️' : theme === 'retro' ? '📜' : '☀️'}
                </span>
                <span className="text-[11px] font-mono">
                  {theme === 'cinema' ? 'Tối (35mm)' : theme === 'retro' ? 'Paper' : 'Modern'}
                </span>
                {theme === 'cinema' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="Dark Mode Active" />
                )}
              </button>

              {/* Daily Streak Badge: Always visible and compact */}
              <button
                onClick={() => onTabChange('analytics')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
                  theme === 'cinema'
                    ? 'bg-[#18130e] border-amber-500/40 text-amber-300 hover:border-amber-400 hover:shadow-xs'
                    : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-900 hover:border-amber-300 hover:shadow-xs'
                }`}
                title={lang === 'vi' ? `Chuỗi học tập: ${streak.currentStreak} ngày liên tiếp!` : `Study streak: ${streak.currentStreak} days in a row!`}
              >
                <Flame className={`w-3.5 h-3.5 ${streak.currentStreak > 0 ? (theme === 'cinema' ? 'text-amber-400 fill-amber-400' : 'text-orange-500 fill-orange-500') : 'text-slate-400'}`} />
                <span className={`text-xs font-bold ${theme === 'cinema' ? 'text-amber-300' : 'text-orange-700'}`}>{streak.currentStreak}</span>
              </button>

              {/* Sound Effects (SFX) Toggle */}
              <button
                type="button"
                onClick={handleToggleSound}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors shrink-0 cursor-pointer ${
                  sfxEnabled
                    ? (theme === 'cinema'
                        ? 'bg-[#18130e] text-amber-300 border-amber-500/40 hover:border-amber-400'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100')
                    : (theme === 'cinema'
                        ? 'bg-[#18130e] text-stone-500 border-stone-800 hover:text-stone-300'
                        : 'text-slate-400 hover:bg-slate-100 border-slate-200/70')
                }`}
                title={sfxEnabled ? (lang === 'vi' ? 'Hiệu ứng âm thanh: ĐANG BẬT (Bấm để tắt)' : 'Sound effects: ON (Click to mute)') : (lang === 'vi' ? 'Hiệu ứng âm thanh: ĐANG TẮT (Bấm để bật)' : 'Sound effects: OFF (Click to unmute)')}
              >
                {sfxEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-[11px] font-mono">{sfxEnabled ? 'SFX' : 'Mute'}</span>
              </button>

              {/* Language Toggle: Visible on sm+, in drawer on mobile */}
              <button
                onClick={toggleLang}
                className={`hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold border transition-colors shrink-0 ${
                  theme === 'cinema'
                    ? 'bg-[#18130e] text-amber-200 border-amber-500/30 hover:bg-[#221a14]'
                    : 'text-slate-600 hover:bg-slate-100 border-slate-200/70'
                }`}
                title="Đổi ngôn ngữ (EN / VI)"
              >
                <span className="text-xs leading-none">{lang === 'en' ? '🇬🇧' : '🇻🇳'}</span>
                <span className="text-[11px] uppercase tracking-wide">{lang}</span>
              </button>

              {/* Desktop Auth */}
              {user ? (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border shrink-0 ${
                      theme === 'cinema'
                        ? 'bg-[#18130e] border-amber-500/30 text-amber-200'
                        : 'bg-slate-100/90 border-slate-200/60 text-slate-700'
                    }`}
                    title={user.email || ''}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-2xs ${
                      theme === 'cinema'
                        ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-stone-950 font-black'
                        : 'bg-gradient-to-br from-teal-400 to-sky-500 text-white'
                    }`}>
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <span className="text-xs font-medium max-w-[90px] xl:max-w-[120px] truncate hidden xl:inline">
                      {user.email}
                    </span>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1 p-1.5 px-2 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition-all shrink-0 cursor-pointer"
                    title={t('logout')}
                    aria-label={t('logout')}
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-[11px] font-bold hidden xl:inline">{t('logout')}</span>
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openAuth('login')}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      theme === 'cinema'
                        ? 'text-amber-200 hover:bg-[#201812]'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => openAuth('signup')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-xs ${
                      theme === 'cinema'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-stone-950 font-bold hover:from-amber-400 hover:to-yellow-500'
                        : 'text-white bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600'
                    }`}
                  >
                    {t('signUp')}
                  </button>
                </div>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className={`lg:hidden p-2 rounded-xl transition-colors cursor-pointer shrink-0 ${
                  theme === 'cinema'
                    ? 'text-amber-300 hover:bg-[#221a14] border border-amber-500/30'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu (Fully styled for Dark Mode / Cinema / Retro / Light) */}
        {mobileOpen && (
          <div className={`lg:hidden border-t shadow-2xl transition-colors animate-fade-in ${
            theme === 'cinema'
              ? 'bg-[#15100c] border-amber-500/30 text-amber-100'
              : theme === 'retro'
              ? 'bg-[#faf5ed] border-amber-200/80 text-stone-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="px-4 py-3 space-y-3">
              {/* Quick Preferences Bar inside Mobile Menu */}
              <div className={`flex items-center justify-between pb-3 border-b ${
                theme === 'cinema' ? 'border-amber-500/20' : 'border-slate-200/80'
              }`}>
                {/* Theme Selector Button */}
                <button
                  onClick={toggleTheme}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    theme === 'cinema'
                      ? 'bg-[#201812] text-amber-300 border-amber-500/40'
                      : theme === 'retro'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{theme === 'cinema' ? '🎞️' : theme === 'retro' ? '📜' : '☀️'}</span>
                  <span>{theme === 'cinema' ? 'Giao diện: Tối 35mm' : theme === 'retro' ? 'Giao diện: Retro Paper' : 'Giao diện: Hiện đại'}</span>
                </button>

                {/* Language Switch Button */}
                <button
                  onClick={toggleLang}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    theme === 'cinema'
                      ? 'bg-[#201812] text-amber-200 border-amber-500/40'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{lang === 'en' ? '🇬🇧 EN' : '🇻🇳 VI'}</span>
                </button>

                {/* Sound Effects Mobile Toggle */}
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    sfxEnabled
                      ? (theme === 'cinema' ? 'bg-[#201812] text-amber-300 border-amber-500/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                      : (theme === 'cinema' ? 'bg-[#140f0c] text-stone-500 border-stone-800' : 'bg-slate-100 text-slate-500 border-slate-200')
                  }`}
                >
                  {sfxEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{sfxEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT'}</span>
                </button>
              </div>

              {/* Navigation Links with 2-line clean native layout (Title + Subtitle) */}
              <nav className="space-y-1.5">
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
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        isActive
                          ? (theme === 'cinema'
                              ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-stone-950 font-black border border-amber-400 shadow-sm'
                              : theme === 'retro'
                              ? 'bg-amber-200/90 text-amber-950 font-bold border border-amber-300 shadow-2xs'
                              : 'bg-sky-50 text-sky-700 font-bold border border-sky-100')
                          : (theme === 'cinema'
                              ? 'text-amber-200/90 hover:bg-[#221a14] hover:text-amber-100'
                              : theme === 'retro'
                              ? 'text-stone-700 hover:bg-amber-100/60'
                              : 'text-slate-600 hover:bg-slate-50')
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isActive
                          ? (theme === 'cinema' ? 'bg-stone-950/20 text-stone-950' : 'bg-sky-100 text-sky-700')
                          : (theme === 'cinema' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-100 text-slate-500')
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col text-left flex-1 min-w-0">
                        <span className="text-sm font-bold leading-tight">{t(tab.labelKey)}</span>
                        <span className={`text-[11px] leading-tight mt-0.5 ${
                          isActive
                            ? (theme === 'cinema' ? 'text-stone-950/80 font-medium' : 'text-sky-800')
                            : (theme === 'cinema' ? 'text-amber-400/60 font-mono' : 'text-slate-400')
                        }`}>
                          {lang === 'vi' ? tab.descriptionVi : tab.descriptionEn}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </nav>

              {/* Mobile Auth Profile / Buttons */}
              {!user ? (
                <div className={`pt-3 border-t flex gap-2 ${theme === 'cinema' ? 'border-amber-500/20' : 'border-slate-100'}`}>
                  <button
                    onClick={() => { openAuth('login'); setMobileOpen(false); }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      theme === 'cinema'
                        ? 'bg-[#201812] text-amber-200 border border-amber-500/30 hover:bg-[#2a2018]'
                        : 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    {t('login')}
                  </button>
                  <button
                    onClick={() => { openAuth('signup'); setMobileOpen(false); }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-xs ${
                      theme === 'cinema'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-stone-950 font-bold border border-amber-400/50 hover:from-amber-400 hover:to-yellow-500'
                        : 'text-white bg-gradient-to-r from-sky-500 to-teal-500'
                    }`}
                  >
                    {t('signUp')}
                  </button>
                </div>
              ) : (
                <div className={`pt-3 border-t flex items-center justify-between px-3.5 py-2.5 rounded-xl ${
                  theme === 'cinema' ? 'border-amber-500/20 bg-[#1c1510]' : 'border-slate-100 bg-slate-50'
                }`}>
                  <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 mr-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      theme === 'cinema'
                        ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-stone-950 font-black'
                        : 'bg-gradient-to-br from-teal-400 to-sky-500 text-white'
                    }`}>
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="truncate">
                      <span className={`text-xs block truncate ${theme === 'cinema' ? 'text-amber-200 font-mono' : 'text-slate-700 font-medium'}`}>
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setMobileOpen(false);
                      await handleSignOut();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors shrink-0 cursor-pointer"
                    title={t('logout')}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <AuthModal open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
    </>
  );
}

