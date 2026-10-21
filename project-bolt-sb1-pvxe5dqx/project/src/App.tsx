import { useState, useEffect } from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { VocabProvider } from '@/context/VocabContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/components/Toast';
import { Header } from '@/components/Header';
import { AddVocabulary } from '@/pages/AddVocabulary';
import { VocabChest } from '@/pages/VocabChest';
import { Quiz } from '@/pages/Quiz';
import { TypingTest } from '@/pages/TypingTest';
import { SentenceBuilding } from '@/pages/SentenceBuilding';
import { ClozeTest } from '@/pages/ClozeTest';
import { Analytics } from '@/pages/Analytics';
import { PenaltyLockModal } from '@/components/PenaltyLockModal';
import { WeeklyGoalSetupModal } from '@/components/WeeklyGoalSetupModal';
import { getActivePenalty, getWeeklyGoal, type ActivePenalty, type WeeklyGoal } from '@/lib/storage';
import { useLanguage } from '@/context/LanguageContext';
import { Lock } from 'lucide-react';
import type { TabKey } from '@/lib/types';

function AppContent() {
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('chest');
  const [activePenalty, setActivePenalty] = useState<ActivePenalty>(() => getActivePenalty());
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal>(() => getWeeklyGoal());
  const [showSetupModal, setShowSetupModal] = useState<boolean>(() => !weeklyGoal.difficultyChosenForWeek);
  const [showPenaltyModal, setShowPenaltyModal] = useState<boolean>(false);

  // Poll penalty & goal state so real-time practice deductions update immediately
  useEffect(() => {
    const timer = setInterval(() => {
      const pen = getActivePenalty();
      setActivePenalty(pen);
      const goal = getWeeklyGoal();
      setWeeklyGoal(goal);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Intercept tab changes during active penalty lockout
  const handleTabChange = (tab: TabKey) => {
    if (activePenalty.isActive && tab !== 'quiz' && tab !== 'cloze') {
      setShowPenaltyModal(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleNavigateToPractice = (tab: TabKey) => {
    setActiveTab(tab);
    setShowPenaltyModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Sticky Penalty In-Progress Banner when user is doing Quiz or Cloze */}
        {activePenalty.isActive && (activeTab === 'quiz' || activeTab === 'cloze') && (
          <div className="mb-6 p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/90 via-slate-900/90 to-rose-950/90 border-2 border-rose-500/50 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400 flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black text-rose-300 uppercase tracking-wider block">
                  {lang === 'vi' ? 'Đang chấp hành hình phạt mở khóa' : 'Penalty Task in Progress'}
                </span>
                <span className="text-xs text-slate-200">
                  🎯 {lang === 'vi' ? 'Trắc nghiệm:' : 'Quiz:'} <strong>{activePenalty.quizDone}/{activePenalty.quizRequired}</strong> • 🧩 {lang === 'vi' ? 'Đục lỗ:' : 'Cloze:'} <strong>{activePenalty.clozeDone}/{activePenalty.clozeRequired}</strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPenaltyModal(true)}
              className="text-xs font-bold text-rose-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 border border-rose-400/30 transition-all cursor-pointer self-start sm:self-center"
            >
              {lang === 'vi' ? 'Xem tiến độ phạt 🔒' : 'View Penalty Status 🔒'}
            </button>
          </div>
        )}

        {/* Regular Tabs: during penalty lockout, only quiz and cloze are accessible */}
        {activePenalty.isActive && activeTab !== 'quiz' && activeTab !== 'cloze' ? (
          <div className="py-24 text-center">
            {/* Penalty Lock Modal covers the view */}
          </div>
        ) : (
          <>
            {activeTab === 'add' && <AddVocabulary />}
            {activeTab === 'chest' && <VocabChest onNavigate={handleTabChange} />}
            {activeTab === 'quiz' && <Quiz />}
            {activeTab === 'typing' && <TypingTest />}
            {activeTab === 'sentence' && <SentenceBuilding />}
            {activeTab === 'cloze' && <ClozeTest />}
            {activeTab === 'analytics' && <Analytics onNavigate={handleTabChange} />}
          </>
        )}
      </main>

      {/* Penalty Lockout Modal (Displayed automatically when locked or when opened) */}
      {(showPenaltyModal || (activePenalty.isActive && activeTab !== 'quiz' && activeTab !== 'cloze')) && (
        <PenaltyLockModal
          onNavigateToPractice={handleNavigateToPractice}
          onUnlocked={() => {
            setActivePenalty(getActivePenalty());
            setShowPenaltyModal(false);
          }}
        />
      )}

      {/* Monday / New Week Goal Setup Modal */}
      {showSetupModal && !activePenalty.isActive && (
        <WeeklyGoalSetupModal
          currentGoal={weeklyGoal}
          isOpen={showSetupModal}
          onClose={() => setShowSetupModal(false)}
          onSaved={(newGoal) => {
            setWeeklyGoal(newGoal);
            setShowSetupModal(false);
          }}
        />
      )}

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        {t('appName')} — {t('tagline')}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <VocabProvider>
              <AppContent />
            </VocabProvider>
          </AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
