import type { Language } from '@/lib/types';
import type { GrammarEvaluation, DetectedError, NativeAlternative, ErrorType } from '@/lib/grammarCheck';

// ============================================================================
// GEMINI SERVICE: Single Source of Truth for all Gemini API Interactions
// Target Model: Exclusively gemini-2.0-flash
// Authentication: Exclusively via x-goog-api-key header (NO Bearer, NO query params)
// Key Resolution: localStorage('vocabmaster_gemini_api_key') -> import.meta.env.VITE_GEMINI_API_KEY
// Request Batching: Max 20 items per prompt
// ============================================================================

export const USER_KEY_STORAGE = 'vocabmaster_gemini_api_key';
export const TARGET_MODEL = 'gemini-2.0-flash';
export const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const CHUNK_SIZE = 20; // Enforce max 20 items per prompt for batch operations

/**
 * Resolves API Key following strict priority:
 * 1. User-provided key in localStorage ('vocabmaster_gemini_api_key')
 * 2. Environment variable VITE_GEMINI_API_KEY
 */
export function resolveApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    const userKey = localStorage.getItem(USER_KEY_STORAGE);
    if (userKey && userKey.trim()) {
      return userKey.trim();
    }
  }

  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim()) {
    return envKey.trim();
  }

  return '';
}

export function isValidGeminiKey(key: string): boolean {
  const trimmed = key.trim();
  // Valid keys start with "AQ." (Google AI Studio format) or "AIzaSy" (GCP format)
  return trimmed.startsWith('AQ.') || trimmed.startsWith('AIzaSy');
}

export function setGeminiApiKey(key: string): void {
  if (typeof localStorage !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(USER_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(USER_KEY_STORAGE);
    }
  }
}

export function clearGeminiApiKey(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_KEY_STORAGE);
  }
}

export function isGeminiConfigured(): boolean {
  return !!resolveApiKey();
}

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; code?: number };
}

/**
 * Low-level REST caller for Gemini API.
 * Strict protocol: Only x-goog-api-key header. Never query param. Never Bearer auth.
 */
async function geminiGenerate(
  prompt: string,
  options?: {
    temperature?: number;
    responseMimeType?: string;
    signal?: AbortSignal;
  }
): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is missing. Please set your API key in Settings or .env file.');
  }

  const { temperature = 0.2, responseMimeType = 'application/json' } = options || {};
  const url = `${BASE_URL}/${TARGET_MODEL}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errData = (await res.json().catch(() => null)) as GeminiApiResponse | null;
      const msg = errData?.error?.message || `HTTP ${res.status}`;
      console.error(`[GeminiService] Error (${res.status}):`, msg);
      throw new Error(`Gemini API Error: ${msg}`);
    }

    const data = (await res.json()) as GeminiApiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty Gemini response received.');
    }

    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(String(err));
  }
}

function safeParseJSON(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // continue
      }
    }
    throw new Error('Failed to parse Gemini JSON output');
  }
}

// ============================================================================
// 1. SENTENCE PRACTICE EVALUATION (Enhanced Breakdown: Grammar, Naturalness, Alternatives)
// ============================================================================

export async function evaluateWithGemini(params: {
  sentence: string;
  targetWord: string;
  wordType: string;
  meaning: string;
  lang: Language;
}): Promise<GrammarEvaluation> {
  const { sentence, targetWord, wordType, meaning } = params;

  const prompt = `You are a senior English language examiner and pedagogical evaluator for a vocabulary learning app.
The user is practicing constructing a sentence using the target word "${targetWord}" (part of speech: ${wordType}, meaning: ${meaning}).

User Sentence: "${sentence}"

Perform a thorough evaluation and output a strict JSON object with this exact structure:
{
  "accuracyScore": number, // Overall composite score (0-100)
  "grammarScore": number, // Strict grammar accuracy score (0-100) based on syntax, tense, subject-verb agreement, articles, prepositions
  "naturalnessScore": number, // Native-speaker naturalness & collocation score (0-100)
  "isSpellingCorrect": boolean, // False if ANY spelling typo exists in the sentence
  "isGrammarCorrect": boolean, // False if grammar or structural rules are violated
  "isNatural": boolean, // True if fluent and idiomatically natural
  "detectedErrors": [
    {
      "type": "Spelling" | "Grammar" | "Structure" | "Collocation",
      "incorrectPart": "exact word/phrase in user sentence that is wrong",
      "correction": "corrected word/phrase",
      "explanationVi": "clear grammatical explanation in Vietnamese"
    }
  ],
  "betterAlternatives": [
    {
      "sentence": "A natural, native-level alternative sentence using '${targetWord}'",
      "translation": "Natural Vietnamese translation",
      "explanation": "Why this sentence is more effective, natural collocations or advanced grammar structure used"
    }
  ],
  "detailedAnalysisVi": "Comprehensive feedback in Vietnamese with sections for Điểm tốt (Strengths), Điểm cần cải thiện (Areas to improve), and Phối hợp từ (Collocations). Use bullet points (•).",
  "grammarRulesBreakdown": "Concise summary of key grammar rules practiced, in Vietnamese."
}

SCORING CRITERIA:
1. grammarScore:
   - 100: Flawless grammar and syntax.
   - 70-90: Minor preposition or article issues.
   - <70: Subject-verb agreement failure, wrong tense, missing main verb, or severe structure flaws.
2. naturalnessScore:
   - 90-100: Idiomatic, native-like collocations.
   - 70-89: Understandable and grammatically sound, but slightly clunky or textbook-like.
   - <70: Literal translation from Vietnamese or awkward word choice.
3. If ANY spelling mistake exists, cap accuracyScore below 50.
4. Provide at least 2 high-quality betterAlternatives using "${targetWord}".`;

  const text = await geminiGenerate(prompt, {
    temperature: 0.3,
    responseMimeType: 'application/json',
  });

  const parsed = safeParseJSON(text);

  const detectedErrorsRaw = (parsed.detectedErrors || []) as Array<{
    type?: string;
    incorrectPart?: string;
    correction?: string;
    explanationVi?: string;
  }>;

  const detectedErrors: DetectedError[] = detectedErrorsRaw.map((e) => ({
    type: (e.type as ErrorType) || 'Grammar',
    incorrectPart: e.incorrectPart || '',
    correction: e.correction || '',
    explanationVi: e.explanationVi || '',
  }));

  const betterAlternativesRaw = (parsed.betterAlternatives || parsed.nativeAlternatives || []) as Array<{
    sentence?: string;
    translation?: string;
    explanation?: string;
  }>;

  const betterAlternatives: NativeAlternative[] = betterAlternativesRaw
    .map((s) => ({
      sentence: s.sentence || '',
      translation: s.translation || '',
      explanation: s.explanation || '',
    }))
    .filter((s) => s.sentence.trim().length > 0);

  const accuracy = Math.max(0, Math.min(100, Number(parsed.accuracyScore) || 0));
  const grammarScore = Math.max(0, Math.min(100, Number(parsed.grammarScore) || (detectedErrors.length === 0 ? 100 : Math.max(40, 100 - detectedErrors.length * 20))));
  const naturalnessScore = Math.max(0, Math.min(100, Number(parsed.naturalnessScore) || (parsed.isNatural ? 90 : 70)));

  const firstAlt = betterAlternatives[0];
  const errors = detectedErrors.map((e) => ({
    message: e.incorrectPart ? `"${e.incorrectPart}" → "${e.correction}"` : e.correction,
    explanation: e.explanationVi,
  }));

  return {
    accuracy,
    grammarScore,
    naturalnessScore,
    isSpellingCorrect: (parsed.isSpellingCorrect as boolean) ?? detectedErrors.every((e) => e.type !== 'Spelling'),
    isGrammarCorrect: (parsed.isGrammarCorrect as boolean) ?? detectedErrors.length === 0,
    isNatural: (parsed.isNatural as boolean) ?? false,
    detectedErrors,
    detailedAnalysisVi: (parsed.detailedAnalysisVi as string) || '',
    nativeAlternatives: betterAlternatives,
    betterAlternatives,
    grammarRulesBreakdown: (parsed.grammarRulesBreakdown as string) || '',
    errors,
    feedback: (parsed.detailedAnalysisVi as string) || '',
    improved: firstAlt?.sentence || '',
    improvedTranslation: firstAlt?.translation || '',
    improvedSentences: betterAlternatives.map((s) => ({ en: s.sentence, vi: s.translation })),
    grammarStructure: (parsed.grammarRulesBreakdown as string) || '',
  };
}

// ============================================================================
// 2. AUTO-NORMALIZE VOCAB BATCH (Chunks of max 20)
// ============================================================================

export interface NormalizedVocabEntry {
  originalWord: string;
  word: string;
  meaning: string;
  partOfSpeech: string;
  ipa: string;
  wasAutoCorrected: boolean;
  correctionNote: string;
}

export async function autoNormalizeVocabBatch(
  entries: Array<{ word: string; meaning: string; type?: string }>
): Promise<NormalizedVocabEntry[]> {
  if (entries.length === 0) return [];

  const results: NormalizedVocabEntry[] = [];

  // Enforce max 20 items per prompt
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);

    const entriesText = chunk
      .map(
        (e, idx) =>
          `${idx + 1}. English: "${e.word.trim().toLowerCase()}", Vietnamese: "${e.meaning.trim()}", Part of speech: "${(e.type || '').trim().toLowerCase()}"`
      )
      .join('\n');

    const prompt = `You are an automated dictionary cleaner. For each input entry below, silently correct English spelling typos, verify accurate Vietnamese translations, provide part of speech and accurate IPA phonetic transcription.

Input entries:
${entriesText}

Return a raw JSON array matching this exact schema:
[
  {
    "originalWord": "raw user input",
    "word": "Corrected English word in lowercase (e.g. 'protectt' -> 'protect')",
    "meaning": "Accurate, natural Vietnamese translation",
    "partOfSpeech": "n | v | adj | adv | phr",
    "ipa": "Standard IPA phonetic transcription (e.g. /prəˈtɛkt/)",
    "wasAutoCorrected": boolean,
    "correctionNote": "Short explanation in Vietnamese if corrected, empty string if correct"
  }
]

CRITICAL RULES:
- Return exactly ${chunk.length} items in the exact same order.
- Standardize all English words in lowercase trimmed form.
- If already correct, set wasAutoCorrected to false.`;

    try {
      const text = await geminiGenerate(prompt, {
        temperature: 0.1,
        responseMimeType: 'application/json',
      });

      let parsed: NormalizedVocabEntry[];
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array found in Gemini response');
        parsed = JSON.parse(match[0]);
      }

      for (let j = 0; j < chunk.length; j++) {
        const item = parsed[j];
        if (!item) {
          results.push({
            originalWord: chunk[j].word,
            word: chunk[j].word.trim().toLowerCase(),
            meaning: chunk[j].meaning.trim(),
            partOfSpeech: (chunk[j].type || '').trim().toLowerCase(),
            ipa: '',
            wasAutoCorrected: false,
            correctionNote: '',
          });
        } else {
          results.push({
            originalWord: chunk[j].word,
            word: (item.word || chunk[j].word).trim().toLowerCase(),
            meaning: (item.meaning || chunk[j].meaning).trim(),
            partOfSpeech: (item.partOfSpeech || chunk[j].type || '').trim().toLowerCase(),
            ipa: item.ipa || '',
            wasAutoCorrected: Boolean(item.wasAutoCorrected),
            correctionNote: item.correctionNote || '',
          });
        }
      }
    } catch (err) {
      console.warn('[GeminiService] autoNormalizeVocabBatch chunk failed, falling back:', err);
      // Fallback with trimmed lowercase values
      for (const entry of chunk) {
        results.push({
          originalWord: entry.word,
          word: entry.word.trim().toLowerCase(),
          meaning: entry.meaning.trim(),
          partOfSpeech: (entry.type || '').trim().toLowerCase(),
          ipa: '',
          wasAutoCorrected: false,
          correctionNote: '',
        });
      }
    }
  }

  return results;
}

// ============================================================================
// 3. BATCH AUDIT & CLEANUP (Chunks of max 20)
// ============================================================================

export interface BatchAuditItem {
  vocabId: string;
  original: { word: string; meaning: string; type: string };
  corrected: { word: string; meaning: string; partOfSpeech: string; ipa: string };
  notes: string[];
}

export interface BatchAuditResult {
  items: BatchAuditItem[];
  totalScanned: number;
  totalErrors: number;
}

export async function batchAuditVocabWithGemini(
  vocabs: Array<{ id: string; word: string; meaning: string; type: string }>,
  onProgress?: (scanned: number, total: number) => void
): Promise<BatchAuditResult> {
  const items: BatchAuditItem[] = [];
  let scanned = 0;
  const total = vocabs.length;

  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    const chunk = vocabs.slice(i, i + CHUNK_SIZE);
    const entriesText = chunk
      .map((e, idx) => `${idx + 1}. id="${e.id}" English: "${e.word}", Vietnamese: "${e.meaning}", POS: "${e.type || ''}"`)
      .join('\n');

    const prompt = `Review these English-Vietnamese vocabulary pairs. Identify spelling errors, translation mismatches, or invalid parts of speech.

Input entries:
${entriesText}

Respond strictly in JSON array format:
[
  {
    "id": "the id from input",
    "originalWord": "the original English word",
    "correctedWord": "corrected English spelling in lowercase",
    "correctedMeaning": "accurate Vietnamese meaning",
    "partOfSpeech": "n | v | adj | adv | phr",
    "hasIssue": true,
    "notes": ["Vietnamese note on what was fixed"]
  }
]

RULES:
- Return exactly ${chunk.length} entries in the same order.
- If an entry is correct, set hasIssue to false.
- All corrected words must be lowercase and trimmed.`;

    try {
      const text = await geminiGenerate(prompt, {
        temperature: 0.1,
        responseMimeType: 'application/json',
      });

      let parsed: Array<{
        id: string;
        originalWord: string;
        correctedWord: string;
        correctedMeaning: string;
        partOfSpeech: string;
        hasIssue: boolean;
        notes: string[];
      }>;

      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array found in audit response');
        parsed = JSON.parse(match[0]);
      }

      for (let j = 0; j < chunk.length; j++) {
        const item = parsed.find((p) => p.id === chunk[j].id) || parsed[j];
        if (!item) continue;

        const correctedWord = (item.correctedWord || chunk[j].word).trim().toLowerCase();
        const correctedMeaning = (item.correctedMeaning || chunk[j].meaning).trim();
        const correctedType = (item.partOfSpeech || chunk[j].type || '').trim().toLowerCase();

        const wordChanged = correctedWord !== chunk[j].word.trim().toLowerCase();
        const meaningChanged = correctedMeaning !== chunk[j].meaning.trim();
        const typeChanged = correctedType !== (chunk[j].type || '').trim().toLowerCase();

        if (item.hasIssue || wordChanged || meaningChanged || typeChanged) {
          items.push({
            vocabId: chunk[j].id,
            original: { word: chunk[j].word, meaning: chunk[j].meaning, type: chunk[j].type },
            corrected: {
              word: correctedWord,
              meaning: correctedMeaning,
              partOfSpeech: correctedType,
              ipa: '',
            },
            notes: item.notes || [],
          });
        }
      }
    } catch (err) {
      console.error('[GeminiService] batchAuditVocab chunk error:', err);
    }

    scanned += chunk.length;
    onProgress?.(scanned, total);
  }

  return {
    items,
    totalScanned: scanned,
    totalErrors: items.length,
  };
}

// ============================================================================
// 4. NORMALIZE SELECTED VOCAB (Chunks of max 20)
// ============================================================================

export interface SelectedNormalizationResult {
  id: string;
  originalWord: string;
  correctedWord: string;
  correctedMeaning: string;
  partOfSpeech: string;
  wasChanged: boolean;
  isDuplicateOf?: string;
}

export async function normalizeSelectedVocabs(
  vocabs: Array<{ id: string; word: string; meaning: string; type: string }>
): Promise<SelectedNormalizationResult[]> {
  if (vocabs.length === 0) return [];

  const results: SelectedNormalizationResult[] = [];
  const correctedWordMap = new Map<string, string>(); // lowercase word -> first id

  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    const chunk = vocabs.slice(i, i + CHUNK_SIZE);
    const entriesText = chunk
      .map((e, idx) => `${idx + 1}. id="${e.id}" English: "${e.word}", Vietnamese: "${e.meaning}", POS: "${e.type || ''}"`)
      .join('\n');

    const prompt = `Review these English-Vietnamese vocabulary pairs. Standardize and fix typos or translation issues.

Input:
${entriesText}

Return raw JSON array:
[
  {
    "id": "id from input",
    "originalWord": "original word",
    "correctedWord": "corrected English word in lowercase",
    "correctedMeaning": "accurate Vietnamese meaning",
    "partOfSpeech": "n | v | adj | adv | phr",
    "hasIssue": boolean
  }
]

RULES:
- Return exactly ${chunk.length} entries in order.
- Lowercase and trim all words.`;

    const text = await geminiGenerate(prompt, {
      temperature: 0.1,
      responseMimeType: 'application/json',
    });

    let parsed: Array<{
      id: string;
      originalWord: string;
      correctedWord: string;
      correctedMeaning: string;
      partOfSpeech: string;
      hasIssue: boolean;
    }>;

    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      parsed = JSON.parse(match[0]);
    }

    for (let j = 0; j < chunk.length; j++) {
      const vocab = chunk[j];
      const item = parsed.find((p) => p.id === vocab.id) || parsed[j];

      if (!item) {
        results.push({
          id: vocab.id,
          originalWord: vocab.word,
          correctedWord: vocab.word.trim().toLowerCase(),
          correctedMeaning: vocab.meaning.trim(),
          partOfSpeech: (vocab.type || '').trim().toLowerCase(),
          wasChanged: false,
        });
        continue;
      }

      const correctedWord = (item.correctedWord || vocab.word).trim().toLowerCase();
      const correctedMeaning = (item.correctedMeaning || vocab.meaning).trim();
      const correctedType = (item.partOfSpeech || vocab.type || '').trim().toLowerCase();

      const isDuplicateOf = correctedWordMap.get(correctedWord);
      const wasChanged =
        item.hasIssue ??
        (correctedWord !== vocab.word.trim().toLowerCase() || correctedMeaning !== vocab.meaning.trim());

      results.push({
        id: vocab.id,
        originalWord: vocab.word,
        correctedWord,
        correctedMeaning,
        partOfSpeech: correctedType,
        wasChanged,
        isDuplicateOf,
      });

      if (!isDuplicateOf) {
        correctedWordMap.set(correctedWord, vocab.id);
      }
    }
  }

  return results;
}
