export interface CollocationItem {
  phrase: string;
  meaning: string;
}

export interface Vocabulary {
  id: string;
  user_id: string;
  word: string;
  type: string;
  meaning: string;
  category: string;
  error_count: number;
  created_at: string;
  // Spaced Repetition (SRS) metadata
  interval?: number;
  easeFactor?: number;
  dueDate?: string;
  repetition?: number;
  phonetic?: string;
  collocations?: CollocationItem[];
}

export type Language = 'en' | 'vi';

export type TabKey =
  | 'add'
  | 'chest'
  | 'quiz'
  | 'typing'
  | 'sentence'
  | 'cloze'
  | 'analytics';

export interface ParsedVocab {
  word: string;
  type: string;
  meaning: string;
  category: string;
  interval?: number;
  easeFactor?: number;
  dueDate?: string;
  repetition?: number;
  collocations?: CollocationItem[];
}

export interface ClozeQuestion {
  vocab: Vocabulary;
  sentenceWithBlank: string;
  fullSentence: string;
  translation: string;
  hint: string;
  options: string[];
  correctIndex: number;
}

export interface QuizQuestion {
  vocab: Vocabulary;
  options: string[];
  correctIndex: number;
}

export interface QuizResult {
  vocabId: string;
  correct: boolean;
}

export interface TypingResult {
  vocabId: string;
  correct: boolean;
}

export interface SentenceResult {
  vocabId: string;
  accuracy: number;
  grammarScore?: number;
  naturalnessScore?: number;
  feedback: string;
  improved: string;
  betterAlternatives?: Array<{
    sentence: string;
    translation: string;
    explanation: string;
  }>;
}
