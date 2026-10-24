/**
 * High-performance, zero-latency Sound Effects (SFX) engine using Web Audio API.
 * Synthesizes crisp, gamified, audio feedback for correct and incorrect answers without
 * relying on external audio assets or network requests.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.55;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('vocabmaster_sfx_enabled');
        this.enabled = stored !== null ? stored === 'true' : true;
        const storedVol = localStorage.getItem('vocabmaster_sfx_volume');
        if (storedVol !== null) {
          const v = parseFloat(storedVol);
          if (!isNaN(v) && v >= 0 && v <= 1) this.volume = v;
        }
      } catch {
        // storage disabled or unavailable
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    try {
      localStorage.setItem('vocabmaster_sfx_enabled', String(val));
      window.dispatchEvent(new CustomEvent('vocabmaster_sfx_toggle', { detail: { enabled: val } }));
    } catch {
      // noop
    }
  }

  public toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    if (next) {
      this.playCorrect();
    }
    return next;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('vocabmaster_sfx_volume', String(this.volume));
    } catch {
      // noop
    }
  }

  /**
   * Delightful, bright gamified chime for correct answers.
   * Plays a cheerful 4-note ascending chord (C5 -> E5 -> G5 -> C6) with natural bell decay.
   */
  public playCorrect() {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Musical notes: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.12, gain: 0.35 },
        { freq: 659.25, time: 0.07, dur: 0.14, gain: 0.4 },
        { freq: 783.99, time: 0.14, dur: 0.18, gain: 0.45 },
        { freq: 1046.5, time: 0.20, dur: 0.38, gain: 0.5 },
      ];

      notes.forEach(({ freq, time, dur, gain: noteGain }) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const overtoneGain = ctx.createGain();

        // Fundamental sine wave for clean bell body
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        // Subtle shimmering octave overtone
        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(freq * 2, now + time);

        const targetVol = this.volume * noteGain;

        // Envelope: fast attack, natural exponential decay
        gainNode.gain.setValueAtTime(0.0001, now + time);
        gainNode.gain.exponentialRampToValueAtTime(targetVol, now + time + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

        overtoneGain.gain.setValueAtTime(0.0001, now + time);
        overtoneGain.gain.exponentialRampToValueAtTime(targetVol * 0.18, now + time + 0.015);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur * 0.7);

        osc.connect(gainNode);
        overtone.connect(overtoneGain);
        gainNode.connect(ctx.destination);
        overtoneGain.connect(ctx.destination);

        osc.start(now + time);
        overtone.start(now + time);
        osc.stop(now + time + dur);
        overtone.stop(now + time + dur);
      });
    } catch {
      // Audio playback safety catch
    }
  }

  /**
   * Warm, soft descending double-tone for incorrect answers.
   * Noticeable and informative, but gentle, friendly, and non-jarring.
   */
  public playIncorrect() {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Descending mellow notes: F3 (174.6Hz) into D3 (146.8Hz)
      const notes = [
        { freq: 240, time: 0.0, dur: 0.15 },
        { freq: 175, time: 0.11, dur: 0.28 },
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gainNode = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.88, now + time + dur);

        // Lowpass filter to ensure tone is mellow and gentle
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now + time);

        const targetVol = this.volume * 0.42;

        gainNode.gain.setValueAtTime(0.0001, now + time);
        gainNode.gain.exponentialRampToValueAtTime(targetVol, now + time + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch {
      // Audio playback safety catch
    }
  }

  /**
   * Celebratory sound when completing a quiz round or hitting a high milestone.
   */
  public playCelebration() {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const arpeggio = [523.25, 659.25, 783.99, 1046.5, 1318.51]; // C - E - G - C - E
      arpeggio.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.08;
        const dur = 0.45;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(this.volume * 0.4, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + dur);
      });
    } catch {
      // Audio playback safety catch
    }
  }

  /**
   * Subtle tap click for selecting options
   */
  public playClick() {
    if (!this.enabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.03);

      gain.gain.setValueAtTime(this.volume * 0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch {
      // noop
    }
  }
}

export const sfx = new SoundEffectsEngine();

// Convenience helper exports
export const playCorrectSound = () => sfx.playCorrect();
export const playIncorrectSound = () => sfx.playIncorrect();
export const playCelebrationSound = () => sfx.playCelebration();
export const playClickSound = () => sfx.playClick();
export const isSoundEnabled = () => sfx.isEnabled();
export const toggleSound = () => sfx.toggle();
export const setSoundEnabled = (val: boolean) => sfx.setEnabled(val);
