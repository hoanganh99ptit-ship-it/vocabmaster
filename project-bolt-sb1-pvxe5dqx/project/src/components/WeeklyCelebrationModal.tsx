import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Trophy,
  Gift,
  Sparkles,
  Flame,
  CheckCircle2,
  X,
  Share2,
  PartyPopper,
  Zap,
  Target,
  ShieldCheck,
} from 'lucide-react';
import {
  DIFFICULTY_CONFIGS,
  markWeeklyGoalCelebrated,
  getStreakData,
  type GoalDifficulty,
  type WeeklyGoal,
} from '@/lib/storage';
import { pushUserDataToCloud } from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/components/Toast';

interface WeeklyCelebrationModalProps {
  goal: WeeklyGoal;
  isOpen: boolean;
  onClose: () => void;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  tilt: number;
  vTilt: number;
  shape: 'rect' | 'circle' | 'star';
  alpha: number;
}

export function WeeklyCelebrationModal({ goal, isOpen, onClose }: WeeklyCelebrationModalProps) {
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const streak = getStreakData();
  const [copied, setCopied] = useState(false);

  const diffConfig = DIFFICULTY_CONFIGS[goal.difficulty as GoalDifficulty] || DIFFICULTY_CONFIGS.medium;

  // Play audio fanfare using Web Audio API
  const playFanfare = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Upbeat victory notes: C5, E5, G5, C6, high shimmer
      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.16 }, // C5
        { freq: 659.25, time: 0.14, dur: 0.16 }, // E5
        { freq: 783.99, time: 0.28, dur: 0.2 }, // G5
        { freq: 1046.5, time: 0.44, dur: 0.65 }, // C6
        { freq: 1318.51, time: 0.5, dur: 0.8 }, // E6 harmonic
      ];

      const now = ctx.currentTime;
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.22, now + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch {
      // Audio context blocked or not permitted; silent fallback
    }
  }, []);

  // Spawn confetti particles
  const fireConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const colors = [
      '#f59e0b', // amber
      '#eab308', // yellow
      '#10b981', // emerald
      '#06b6d4', // cyan
      '#6366f1', // indigo
      '#ec4899', // pink
      '#f43f5e', // rose
      '#ffffff', // white sparkle
    ];

    const shapes: ('rect' | 'circle' | 'star')[] = ['rect', 'circle', 'star'];
    const newParticles: Particle[] = [];
    const count = 100;

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI) / 2 + Math.PI / 4; // 45 to 135 deg downwards/spread
      const speed = Math.random() * 8 + 4;
      newParticles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.15 + (Math.random() - 0.5) * 50,
        size: Math.random() * 8 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * speed * 2,
        vy: -Math.sin(angle) * speed * 0.8, // upward burst then fall
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        tilt: Math.random() * 10,
        vTilt: Math.random() * 0.1 + 0.05,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        alpha: 1,
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles];
  }, []);

  // Initialize and run confetti animation loop
  useEffect(() => {
    if (!isOpen) return;

    playFanfare();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    fireConfetti();

    // Secondary burst after 400ms for dramatic celebratory flair
    const burstTimer = setTimeout(() => {
      fireConfetti();
    }, 450);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.vx *= 0.98; // air resistance
        p.rot += p.vRot;
        p.tilt += p.vTilt;

        // Fade out as it hits lower bounds
        if (p.y > canvas.height * 0.8) {
          p.alpha -= 0.02;
        }

        if (p.y > canvas.height || p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          // 4-point star sparkle
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.3, -p.size * 0.3);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(p.size * 0.3, p.size * 0.3);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.3, p.size * 0.3);
          ctx.lineTo(-p.size, 0);
          ctx.lineTo(-p.size * 0.3, -p.size * 0.3);
          ctx.closePath();
          ctx.fill();
        }

        ctx.restore();
      }

      if (particles.length > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      clearTimeout(burstTimer);
      window.removeEventListener('resize', resize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      particlesRef.current = [];
    };
  }, [isOpen, fireConfetti, playFanfare]);

  if (!isOpen) return null;

  const handleAcknowledgeAndClose = () => {
    markWeeklyGoalCelebrated();
    pushUserDataToCloud(true);
    onClose();
    toast.show(
      lang === 'vi'
        ? '🎉 Chúc bạn tận hưởng phần thưởng thật vui vẻ và giữ vững phong độ!'
        : '🎉 Enjoy your well-earned reward and keep up the great momentum!',
      'success'
    );
  };

  const handleCopyAchievement = () => {
    const textVi = `🏆 Tôi vừa hoàn thành Thử thách Tuần ${goal.weekKey} trên VocabMaster!\n🎯 Cấp độ: ${diffConfig.nameVi} (${goal.quizReviewed}/${goal.quizTarget} trắc nghiệm, ${goal.clozeReviewed}/${goal.clozeTarget} đục lỗ ngữ cảnh).\n🔥 Chuỗi ngày: ${streak.currentStreak} ngày liên tục.\n🎁 Phần thưởng đã mở khóa: "${goal.rewardText}"! ✨`;
    const textEn = `🏆 I just completed the Week ${goal.weekKey} Challenge on VocabMaster!\n🎯 Level: ${diffConfig.nameEn} (${goal.quizReviewed}/${goal.quizTarget} Quiz, ${goal.clozeReviewed}/${goal.clozeTarget} Cloze).\n🔥 Study Streak: ${streak.currentStreak} days.\n🎁 Unlocked Reward: "${goal.rewardText}"! ✨`;

    const textToCopy = lang === 'vi' ? textVi : textEn;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      toast.show(
        lang === 'vi' ? 'Đã sao chép vinh danh vào clipboard!' : 'Achievement copied to clipboard!',
        'success'
      );
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const quizPct = Math.round((goal.quizReviewed / Math.max(1, goal.quizTarget)) * 100);
  const clozePct = Math.round((goal.clozeReviewed / Math.max(1, goal.clozeTarget)) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      {/* Confetti canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-30 w-full h-full"
      />

      <div
        className={`relative w-full max-w-xl rounded-3xl p-5 sm:p-8 shadow-2xl border-2 overflow-hidden my-auto z-20 ${
          theme === 'cinema'
            ? 'bg-gradient-to-b from-[#1c1611] via-[#2a1d13] to-[#140e0a] border-amber-500/50 text-amber-100 shadow-amber-500/20'
            : theme === 'retro'
            ? 'bg-gradient-to-b from-[#fffdfa] via-[#f7f0e4] to-[#ede3d1] border-amber-700/30 text-stone-900 shadow-2xl'
            : 'bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 border-indigo-500/50 text-white shadow-sky-500/20'
        }`}
      >
        {/* Glow ambient decorations */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          type="button"
          onClick={handleAcknowledgeAndClose}
          className={`absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer z-40 ${
            theme === 'cinema'
              ? 'bg-amber-500/10 hover:bg-amber-500/25 text-amber-300'
              : theme === 'retro'
              ? 'bg-stone-300/60 hover:bg-stone-300 text-stone-800'
              : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white'
          }`}
          title={lang === 'vi' ? 'Đóng' : 'Close'}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content container */}
        <div className="relative z-10 text-center">
          {/* Trophy Header with radiating sunburst effect */}
          <div className="relative inline-block mb-3">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full blur-xl opacity-40 animate-pulse" />
            <div
              className={`w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-3xl flex items-center justify-center relative shadow-xl border-2 transform hover:scale-105 transition-transform ${
                theme === 'cinema'
                  ? 'bg-gradient-to-tr from-amber-600 via-yellow-500 to-amber-300 border-amber-300 text-stone-950 shadow-amber-500/40'
                  : theme === 'retro'
                  ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 border-amber-600 text-amber-950 shadow-amber-700/30'
                  : 'bg-gradient-to-tr from-amber-400 via-yellow-400 to-amber-200 border-amber-200 text-amber-950 shadow-amber-500/50'
              }`}
            >
              <Trophy className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-md animate-bounce-subtle" />
              <Sparkles className="w-6 h-6 absolute -top-2 -right-2 text-yellow-300 fill-yellow-300 animate-spin" />
            </div>
          </div>

          {/* Badge & Week Info */}
          <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
            <span
              className={`text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-xs ${
                theme === 'cinema'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-mono'
                  : theme === 'retro'
                  ? 'bg-amber-100 text-amber-900 border-amber-300 font-mono'
                  : 'bg-sky-500/20 text-sky-300 border-sky-400/40'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {lang === 'vi' ? 'THỬ THÁCH TUẦN' : 'WEEKLY CHALLENGE'} • {goal.weekKey}
              </span>
            </span>

            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                goal.difficulty === 'nightmare'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : goal.difficulty === 'hard'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {lang === 'vi' ? `Mức độ: ${diffConfig.nameVi}` : `Level: ${diffConfig.nameEn}`}
            </span>
          </div>

          {/* Main Title */}
          <h2
            className={`text-xl sm:text-2xl lg:text-3xl font-black tracking-tight mb-2 ${
              theme === 'cinema'
                ? 'text-amber-100 font-serif'
                : theme === 'retro'
                ? 'text-stone-900 font-serif'
                : 'text-white'
            }`}
          >
            {lang === 'vi'
              ? '🎉 XUẤT SẮC! HOÀN THÀNH CHỈ TIÊU TUẦN!'
              : '🎉 CONGRATULATIONS! CHALLENGE CLEARED!'}
          </h2>

          <p
            className={`text-xs sm:text-sm max-w-md mx-auto mb-5 leading-relaxed ${
              theme === 'cinema'
                ? 'text-amber-200/80'
                : theme === 'retro'
                ? 'text-stone-700'
                : 'text-slate-300'
            }`}
          >
            {lang === 'vi'
              ? 'Bạn đã giữ vững kỷ luật thép và hoàn thành 100% mục tiêu học tập của tuần này! Mọi tính năng ứng dụng đều an toàn tuyệt đối.'
              : 'You stayed disciplined and smashed 100% of your weekly targets! Your app is safe and fully unlocked.'}
          </p>

          {/* Spotlight Unlocked Reward Card */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border-2 text-left mb-5 shadow-lg relative overflow-hidden ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-950/60 via-[#261c14] to-amber-950/60 border-amber-400/60 shadow-amber-500/20'
                : theme === 'retro'
                ? 'bg-white border-amber-500/60 text-stone-900 shadow-amber-900/10'
                : 'bg-gradient-to-r from-emerald-950/50 via-slate-900/80 to-emerald-950/50 border-emerald-400/50 text-white shadow-emerald-500/10'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-tr from-amber-500 to-yellow-500 text-stone-950'
                    : theme === 'retro'
                    ? 'bg-amber-100 border border-amber-300 text-amber-700'
                    : 'bg-gradient-to-tr from-emerald-400 to-teal-500 text-slate-950'
                }`}
              >
                <Gift className="w-6 h-6" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                    {lang === 'vi' ? '🎁 PHẦN THƯỞNG ĐÃ MỞ KHÓA:' : '🎁 UNLOCKED REWARD:'}
                  </span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <h4
                  className={`text-base sm:text-lg font-black leading-snug mb-1 ${
                    theme === 'retro' ? 'text-amber-900 font-serif' : 'text-amber-100'
                  }`}
                >
                  {goal.rewardText}
                </h4>
                <p
                  className={`text-xs ${
                    theme === 'cinema'
                      ? 'text-amber-300/70'
                      : theme === 'retro'
                      ? 'text-stone-600'
                      : 'text-slate-300'
                  }`}
                >
                  {lang === 'vi'
                    ? 'Hãy tận hưởng phần thưởng xứng đáng này sau 1 tuần nỗ lực học tập không ngừng nghỉ!'
                    : 'Enjoy this well-deserved reward after a full week of consistent learning!'}
                </p>
              </div>
            </div>
          </div>

          {/* Stats Breakdown Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 text-center">
            {/* Stat 1: Quiz */}
            <div
              className={`p-3 rounded-2xl border ${
                theme === 'cinema'
                  ? 'bg-[#140e0b] border-amber-500/30'
                  : theme === 'retro'
                  ? 'bg-white/80 border-amber-200'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <Target className="w-3 h-3" />
                <span>{lang === 'vi' ? 'Trắc nghiệm' : 'Quiz'}</span>
              </div>
              <div className="text-base sm:text-lg font-black font-mono">
                {goal.quizReviewed}/{goal.quizTarget}
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                ✓ {quizPct}% {lang === 'vi' ? 'chỉ tiêu' : 'target'}
              </div>
            </div>

            {/* Stat 2: Cloze */}
            <div
              className={`p-3 rounded-2xl border ${
                theme === 'cinema'
                  ? 'bg-[#140e0b] border-amber-500/30'
                  : theme === 'retro'
                  ? 'bg-white/80 border-amber-200'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <Zap className="w-3 h-3" />
                <span>{lang === 'vi' ? 'Đục lỗ' : 'Cloze'}</span>
              </div>
              <div className="text-base sm:text-lg font-black font-mono">
                {goal.clozeReviewed}/{goal.clozeTarget}
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                ✓ {clozePct}% {lang === 'vi' ? 'chỉ tiêu' : 'target'}
              </div>
            </div>

            {/* Stat 3: Streak */}
            <div
              className={`p-3 rounded-2xl border ${
                theme === 'cinema'
                  ? 'bg-[#140e0b] border-amber-500/30'
                  : theme === 'retro'
                  ? 'bg-white/80 border-amber-200'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <Flame className="w-3 h-3 text-orange-400 fill-orange-400" />
                <span>Streak</span>
              </div>
              <div className="text-base sm:text-lg font-black font-mono text-orange-400">
                {streak.currentStreak} {lang === 'vi' ? 'ngày' : 'days'}
              </div>
              <div className="text-[10px] text-amber-300 font-semibold mt-0.5 flex items-center justify-center gap-0.5">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>{lang === 'vi' ? 'Miễn phạt' : 'Safe'}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {/* Primary confirmation */}
            <button
              type="button"
              onClick={handleAcknowledgeAndClose}
              className={`w-full sm:flex-1 py-3.5 px-5 rounded-2xl font-black text-sm tracking-wide shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 transform active:scale-95 ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-500 text-stone-950 shadow-amber-500/30'
                  : theme === 'retro'
                  ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-amber-900/20'
                  : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-slate-950 shadow-emerald-500/30'
              }`}
            >
              <PartyPopper className="w-4 h-4" />
              <span>
                {lang === 'vi' ? '🎉 Nhận thưởng & Tiếp tục' : '🎉 Claim Reward & Continue'}
              </span>
            </button>

            {/* Re-fire confetti burst */}
            <button
              type="button"
              onClick={() => {
                fireConfetti();
                playFanfare();
              }}
              className={`w-full sm:w-auto py-3 px-4 rounded-2xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                theme === 'cinema'
                  ? 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                  : theme === 'retro'
                  ? 'bg-amber-100/60 hover:bg-amber-200/70 border-amber-300 text-amber-900'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200 hover:text-white'
              }`}
              title={lang === 'vi' ? 'Bắn thêm pháo hoa' : 'Shoot more confetti'}
            >
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>{lang === 'vi' ? 'Bắn pháo hoa' : 'Confetti'}</span>
            </button>

            {/* Copy shareable achievement */}
            <button
              type="button"
              onClick={handleCopyAchievement}
              className={`w-full sm:w-auto py-3 px-4 rounded-2xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                theme === 'cinema'
                  ? 'bg-amber-500/10 hover:bg-amber-500/25 border-amber-500/40 text-amber-300'
                  : theme === 'retro'
                  ? 'bg-amber-100/60 hover:bg-amber-200/70 border-amber-300 text-amber-900'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200 hover:text-white'
              }`}
              title={lang === 'vi' ? 'Sao chép vinh danh thành tích' : 'Copy achievement'}
            >
              <Share2 className="w-4 h-4" />
              <span>{copied ? (lang === 'vi' ? 'Đã chép!' : 'Copied!') : (lang === 'vi' ? 'Chia sẻ' : 'Share')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
