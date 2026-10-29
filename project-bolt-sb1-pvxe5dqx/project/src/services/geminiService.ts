import type { Language, Vocabulary, ClozeQuestion, CollocationItem, CompanionChestWord } from '@/lib/types';
import type { GrammarEvaluation, DetectedError, NativeAlternative, ErrorType } from '@/lib/grammarCheck';
import {
  getCollocationsForWordFromCache,
  saveCollocationsForWordToCache,
  saveBatchCollocationsToCache,
  getExampleForWordFromCache,
} from '@/lib/storage';

// ============================================================================
// GEMINI SERVICE: Single Source of Truth for all Gemini API Interactions
// Target Model: Exclusively gemini-2.0-flash
// Authentication: Exclusively via x-goog-api-key header (NO Bearer, NO query params)
// Key Resolution: localStorage('vocabmaster_gemini_api_key') -> import.meta.env.VITE_GEMINI_API_KEY
// Request Batching: 15 items per prompt (CHUNK_SIZE = 15)
// ============================================================================

export const USER_KEY_STORAGE = 'vocabmaster_gemini_api_key';
export const TARGET_MODEL = 'gemini-flash-lite-latest';
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
export const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const CHUNK_SIZE = 25; // 25 items per prompt for optimal throughput, speed & quota efficiency

// Runtime preferred model (automatically switches to FALLBACK_MODEL if TARGET_MODEL returns 404/503)
let currentPreferredModel: string = TARGET_MODEL;

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
  return trimmed.startsWith('AQ.') || trimmed.startsWith('AIzaSy');
}

export function setGeminiApiKey(key: string): void {
  currentPreferredModel = TARGET_MODEL; // Reset preferred model on new key setup
  if (typeof localStorage !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(USER_KEY_STORAGE, key.trim());
    } else {
      localStorage.removeItem(USER_KEY_STORAGE);
    }
  }
}

export function clearGeminiApiKey(): void {
  currentPreferredModel = TARGET_MODEL;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_KEY_STORAGE);
  }
}

export function isGeminiConfigured(): boolean {
  return !!resolveApiKey();
}

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; code?: number; status?: string };
}

/**
 * Robust JSON parser that handles:
 * - Markdown code fences: ```json ... ``` or ``` ... ```
 * - Preamble / trailing text from LLM
 * - Trailing commas in arrays or objects
 */
export function cleanAndParseJSON<T = unknown>(rawText: string): T {
  let cleaned = rawText.trim();

  // If text contains markdown code fences anywhere (e.g. ```json ... ```), extract inner content
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  } else {
    // Strip leading and trailing fences if not caught by non-greedy match
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 2. Try regex extraction of array [...]
    const arrayMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/) || cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const sanitized = arrayMatch[0].replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized) as T;
      } catch {
        // continue
      }
    }

    // 3. Try regex extraction of object {...}
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const sanitized = objMatch[0].replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(sanitized) as T;
      } catch {
        // continue
      }
    }

    // 4. Try global trailing commas replacement on entire text
    try {
      const sanitized = cleaned.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(sanitized) as T;
    } catch {
      // continue
    }
  }

  throw new Error(`Không thể giải mã phản hồi JSON từ Gemini. Phản hồi: ${rawText.substring(0, 150)}...`);
}

interface EndpointCandidate {
  name: string;
  url: string;
}

export const ENDPOINT_CANDIDATES: EndpointCandidate[] = [
  {
    name: 'gemini-flash-lite-latest (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
  },
  {
    name: 'gemini-3.5-flash-lite (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  },
  {
    name: 'gemini-3.5-flash (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
  },
  {
    name: 'gemini-3.8-flash (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  },
  {
    name: 'gemini-3.7-flash (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
  },
  {
    name: 'gemini-3.1-flash-lite (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
  },
  {
    name: 'gemma-4-26b-a4b-it (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent',
  },
];

let preferredEndpointIndex = 0;

type GeminiCallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; message: string; isFatalAuth: boolean; canFallback: boolean };

/**
 * Call a specific Gemini REST endpoint URL.
 * Headers: Strictly 'x-goog-api-key': apiKey. No query params, no Bearer token.
 */
async function callSingleEndpoint(
  endpoint: EndpointCandidate,
  prompt: string,
  apiKey: string,
  options?: {
    temperature?: number;
    responseMimeType?: string;
    signal?: AbortSignal;
    retries?: number;
  }
): Promise<GeminiCallResult> {
  const { temperature = 0.1, responseMimeType = 'application/json', retries = 1 } = options || {};

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType,
    },
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options?.signal?.aborted) {
      throw new Error('Đã hủy yêu cầu.');
    }

    if (attempt > 0) {
      const delayMs = attempt * 1200;
      console.warn(`[GeminiService] Thử lại lượt ${attempt} (${endpoint.name}) sau ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body,
        signal: options?.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as GeminiApiResponse | null;
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        console.error(`[GeminiService] ${endpoint.name} HTTP ${res.status}:`, msg);

        // 401/403: Invalid API key -> fatal auth error, do not retry
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            status: res.status,
            message: `Lỗi xác thực Gemini API (${res.status}): API Key không hợp lệ hoặc không có quyền truy cập.`,
            isFatalAuth: true,
            canFallback: false,
          };
        }

        // 404 (Model not found/unsupported on this endpoint version) or 503 (Overloaded)
        if (res.status === 404 || res.status === 503) {
          return {
            ok: false,
            status: res.status,
            message: msg,
            isFatalAuth: false,
            canFallback: true,
          };
        }

        // 429: Rate limit or daily quota exhausted for this model (e.g. preview 20 RPD cap)
        if (res.status === 429) {
          console.warn(`[GeminiService] ${endpoint.name} chạm giới hạn Quota/Rate Limit (429): ${msg}. Tự động fallback sang model khác...`);
          return {
            ok: false,
            status: 429,
            message: `Model ${endpoint.name} đã chạm giới hạn (429: ${msg})`,
            isFatalAuth: false,
            canFallback: true,
          };
        }

        return {
          ok: false,
          status: res.status,
          message: `Gemini API Error (${endpoint.name} ${res.status}): ${msg}`,
          isFatalAuth: false,
          canFallback: false,
        };
      }

      const data = (await res.json()) as GeminiApiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return {
          ok: false,
          status: 200,
          message: `Gemini (${endpoint.name}) trả về nội dung rỗng (empty candidate).`,
          isFatalAuth: false,
          canFallback: true,
        };
      }

      return { ok: true, text };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          throw new Error('Yêu cầu tới Gemini API đã bị quá thời gian chờ (timeout 45s).');
        }
        if (err.message.includes('xác thực') || err.message.includes('401') || err.message.includes('403')) {
          throw err;
        }
      }
      if (attempt >= retries) {
        return {
          ok: false,
          status: 0,
          message: err instanceof Error ? err.message : String(err),
          isFatalAuth: false,
          canFallback: true,
        };
      }
    }
  }

  return {
    ok: false,
    status: 500,
    message: `Không thể kết nối tới endpoint ${endpoint.name} sau nhiều lần thử.`,
    isFatalAuth: false,
    canFallback: true,
  };
}

/**
 * Dynamically queries Google ModelService.ListModels to detect active models for this key.
 */
async function discoverWorkingModels(apiKey: string): Promise<EndpointCandidate[]> {
  const versions = ['v1', 'v1beta'];
  const discovered: EndpointCandidate[] = [];

  for (const ver of versions) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models`, {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
        } | null;
        if (Array.isArray(data?.models)) {
          for (const m of data.models) {
            const hasGenContent =
              m.supportedGenerationMethods?.includes('generateContent') ||
              ((m as { supportedActions?: string[] }).supportedActions?.includes('generateContent') ?? false);
            if (m.name && hasGenContent) {
              const modelId = m.name.replace(/^models\//, '');
              discovered.push({
                name: `${modelId} (${ver} discovered)`,
                url: `https://generativelanguage.googleapis.com/${ver}/models/${modelId}:generateContent`,
              });
            }
          }
        }
      }
    } catch {
      // ignore discovery failures
    }
  }

  // Prioritize 3.8 and flash models
  return discovered.sort((a, b) => {
    const aScore = (a.name.includes('3.8') ? 3 : 0) + (a.name.includes('flash') ? 1 : 0);
    const bScore = (b.name.includes('3.8') ? 3 : 0) + (b.name.includes('flash') ? 1 : 0);
    return bScore - aScore;
  });
}

/**
 * Low-level REST caller for Gemini API.
 * Strict protocol: Only x-goog-api-key header. Never query param. Never Bearer auth.
 * Automatically tries next candidates (v1beta 2.0-flash -> v1 1.5-flash -> v1beta 1.5-flash -> discovery)
 * if any model returns 404 or 503.
 */
async function geminiGenerate(
  prompt: string,
  options?: {
    temperature?: number;
    responseMimeType?: string;
    signal?: AbortSignal;
    retries?: number;
  }
): Promise<string> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('Thiếu Gemini API key! Vui lòng cấu hình API key trong cài đặt hoặc file .env.');
  }

  // Re-order candidates to test preferredEndpointIndex first
  const candidates: EndpointCandidate[] = [
    ENDPOINT_CANDIDATES[preferredEndpointIndex] || ENDPOINT_CANDIDATES[0],
    ...ENDPOINT_CANDIDATES.filter((_, idx) => idx !== preferredEndpointIndex),
  ];

  let lastFailureMessage = '';

  for (let i = 0; i < candidates.length; i++) {
    const endpoint = candidates[i];
    console.log(`[GeminiService] Đang gọi endpoint: ${endpoint.name}...`);

    const result = await callSingleEndpoint(endpoint, prompt, apiKey, options);

    if (result.ok) {
      // Update preferred endpoint so future batch calls go straight here
      const originalIdx = ENDPOINT_CANDIDATES.findIndex((c) => c.url === endpoint.url);
      if (originalIdx >= 0) {
        preferredEndpointIndex = originalIdx;
      }
      return result.text;
    }

    if (result.isFatalAuth) {
      throw new Error(result.message);
    }

    lastFailureMessage = result.message;

    if (result.canFallback) {
      console.warn(
        `[GeminiService] ${endpoint.name} không khả dụng (HTTP ${result.status}). Tự động fallback sang candidate tiếp theo...`
      );
      continue;
    }

    throw new Error(result.message);
  }

  // Dynamic discovery if all predefined candidates returned 404/503
  console.warn('[GeminiService] Đang truy vấn ModelService.ListModels từ Google để tìm model khả dụng...');
  const discovered = await discoverWorkingModels(apiKey);

  for (const endpoint of discovered) {
    console.log(`[GeminiService] Thử model phát hiện tự động: ${endpoint.name}...`);
    const result = await callSingleEndpoint(endpoint, prompt, apiKey, options);
    if (result.ok) {
      console.log(`[GeminiService] Đã kết nối thành công với ${endpoint.name}!`);
      return result.text;
    }
    if (result.isFatalAuth) {
      throw new Error(result.message);
    }
    lastFailureMessage = result.message;
  }

  throw new Error(
    `Không có model Gemini nào phản hồi khả dụng. Lỗi chi tiết: ${lastFailureMessage || 'Google trả về 404 cho tất cả model'}. Vui lòng kiểm tra lại API Key tại https://aistudio.google.com/app/apikey.`
  );
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

  const parsed = cleanAndParseJSON<Record<string, unknown>>(text);

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
  const grammarScore = Math.max(
    0,
    Math.min(
      100,
      Number(parsed.grammarScore) ||
        (detectedErrors.length === 0 ? 100 : Math.max(40, 100 - detectedErrors.length * 20))
    )
  );
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
// 2. AUTO-NORMALIZE VOCAB BATCH (Chunks of max 15)
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

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);

    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1200));
    }

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
    "word": "Corrected English word in lowercase (e.g. 'protectt' -> 'protect', 'protecttt' -> 'protect')",
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

      const parsed = cleanAndParseJSON<NormalizedVocabEntry[]>(text);

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
    } catch (chunkErr) {
      console.warn('[GeminiService] autoNormalizeVocabBatch chunk failed, falling back:', chunkErr);
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
// 3. BATCH AUDIT & SPELLCHECK (Chunks of 15, Strict Error Propagation, Heuristic Check)
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

export interface BatchAuditProgress {
  scanned: number;
  total: number;
  errorsFound: number;
  currentChunk: number;
  totalChunks: number;
}

export async function batchAuditVocabWithGemini(
  vocabs: Array<{ id: string; word: string; meaning: string; type: string }>,
  onProgress?: (progress: BatchAuditProgress) => void,
  signal?: AbortSignal
): Promise<BatchAuditResult> {
  if (vocabs.length === 0) {
    return { items: [], totalScanned: 0, totalErrors: 0 };
  }

  const items: BatchAuditItem[] = [];
  let scanned = 0;
  const total = vocabs.length;
  const totalChunks = Math.ceil(total / CHUNK_SIZE);

  const chunks: Array<{ chunk: typeof vocabs; chunkIndex: number; startIndex: number }> = [];
  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    chunks.push({
      chunk: vocabs.slice(i, i + CHUNK_SIZE),
      chunkIndex: Math.floor(i / CHUNK_SIZE) + 1,
      startIndex: i,
    });
  }

  const CONCURRENCY = 2;
  let nextChunkIdx = 0;

  async function worker() {
    while (nextChunkIdx < chunks.length) {
      if (signal?.aborted) {
        throw new Error('Đã hủy quá trình kiểm tra.');
      }

      const c = chunks[nextChunkIdx++];
      if (!c) break;

      const entriesText = c.chunk
        .map(
          (e, idx) =>
            `${idx + 1}. [id="${e.id}"] Word: "${e.word}", Meaning: "${e.meaning}", Type: "${e.type || ''}"`
        )
        .join('\n');

      const prompt = `You are a strict English lexicographer and dictionary spellchecker.
Analyze this list of English-Vietnamese vocabulary pairs. Identify any English spelling errors, typos, repeated characters, meaning mismatches, or invalid parts of speech.

Input entries:
${entriesText}

CRITICAL SPELLCHECK RULES:
1. Fix all spelling typos and repeated chars (e.g. "protecttt" -> "protect", "enviroment" -> "environment").
2. Verify Vietnamese translation matches the English word.
3. If entry is 100% correct in spelling, meaning, and part of speech, set hasIssue: false.
4. Return exactly ${c.chunk.length} entries in the same order in JSON format:
[
  {
    "id": "the exact id from input",
    "originalWord": "the original English word",
    "correctedWord": "corrected English spelling in lowercase (e.g. 'protect')",
    "correctedMeaning": "accurate Vietnamese meaning",
    "partOfSpeech": "n | v | adj | adv | phr",
    "hasIssue": boolean,
    "notes": ["Clear Vietnamese explanation of what was corrected"]
  }
]`;

      let text: string;
      try {
        text = await geminiGenerate(prompt, {
          temperature: 0.1,
          responseMimeType: 'application/json',
          signal,
        });
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        throw new Error(`Lỗi kết nối Gemini ở từ ${c.startIndex + 1} - ${c.startIndex + c.chunk.length} / ${total}: ${msg}`);
      }

      let parsed: Array<{
        id: string;
        originalWord: string;
        correctedWord: string;
        correctedMeaning: string;
        partOfSpeech: string;
        hasIssue: boolean;
        notes?: string[];
      }>;

      try {
        parsed = cleanAndParseJSON<typeof parsed>(text);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`Lỗi phân tích JSON ở từ ${c.startIndex + 1} - ${c.startIndex + c.chunk.length}: ${msg}`);
      }

      for (let j = 0; j < c.chunk.length; j++) {
        const orig = c.chunk[j];
        const item = parsed.find((p) => p.id === orig.id) || parsed[j];
        if (!item) continue;

        let correctedWord = (item.correctedWord || orig.word).trim().toLowerCase();
        const correctedMeaning = (item.correctedMeaning || orig.meaning).trim();
        const correctedType = (item.partOfSpeech || orig.type || '').trim().toLowerCase();

        // Heuristic fallback: detect 3+ identical consecutive characters (e.g., "protecttt" -> "protect")
        const hasObviousRepetition = /(.)\1{2,}/i.test(orig.word);
        if (hasObviousRepetition && correctedWord === orig.word.trim().toLowerCase()) {
          correctedWord = orig.word.trim().toLowerCase().replace(/(.)\1{2,}/g, '$1');
        }

        const wordChanged = correctedWord !== orig.word.trim().toLowerCase();
        const meaningChanged = correctedMeaning !== orig.meaning.trim();
        const typeChanged = correctedType !== (orig.type || '').trim().toLowerCase();

        if (item.hasIssue || wordChanged || meaningChanged || typeChanged || hasObviousRepetition) {
          items.push({
            vocabId: orig.id,
            original: { word: orig.word, meaning: orig.meaning, type: orig.type },
            corrected: {
              word: correctedWord,
              meaning: correctedMeaning,
              partOfSpeech: correctedType,
              ipa: '',
            },
            notes:
              item.notes && item.notes.length > 0
                ? item.notes
                : [wordChanged || hasObviousRepetition ? `Sửa chính tả: "${orig.word}" → "${correctedWord}"` : 'Chuẩn hóa định dạng'],
          });
        }
      }

      scanned += c.chunk.length;
      onProgress?.({
        scanned: Math.min(total, scanned),
        total,
        errorsFound: items.length,
        currentChunk: Math.min(totalChunks, Math.ceil(scanned / CHUNK_SIZE)),
        totalChunks,
      });

      // Small delay between calls from the same worker
      if (nextChunkIdx < chunks.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);

  return {
    items,
    totalScanned: scanned,
    totalErrors: items.length,
  };
}

// ============================================================================
// 4. NORMALIZE SELECTED VOCAB (Chunks of 15, Strict Error Propagation)
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
  vocabs: Array<{ id: string; word: string; meaning: string; type: string }>,
  onProgress?: (progress: BatchAuditProgress) => void,
  signal?: AbortSignal
): Promise<SelectedNormalizationResult[]> {
  if (vocabs.length === 0) return [];

  const results: SelectedNormalizationResult[] = [];
  let scanned = 0;
  const total = vocabs.length;
  const totalChunks = Math.ceil(total / CHUNK_SIZE);

  const chunks: Array<{ chunk: typeof vocabs; chunkIndex: number; startIndex: number }> = [];
  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    chunks.push({
      chunk: vocabs.slice(i, i + CHUNK_SIZE),
      chunkIndex: Math.floor(i / CHUNK_SIZE) + 1,
      startIndex: i,
    });
  }

  const CONCURRENCY = 2;
  let nextChunkIdx = 0;

  async function worker() {
    while (nextChunkIdx < chunks.length) {
      if (signal?.aborted) {
        throw new Error('Đã hủy quá trình kiểm tra.');
      }

      const c = chunks[nextChunkIdx++];
      if (!c) break;

      const entriesText = c.chunk
        .map(
          (e, idx) =>
            `${idx + 1}. [id="${e.id}"] Word: "${e.word}", Meaning: "${e.meaning}", POS: "${e.type || ''}"`
        )
        .join('\n');

      const prompt = `You are a strict English lexicographer and dictionary spellchecker.
Review these English-Vietnamese vocabulary pairs. Identify any spelling typos, repetitive letters (e.g., 'protecttt' -> 'protect'), incorrect translations, or wrong parts of speech.

Input:
${entriesText}

Return raw JSON array:
[
  {
    "id": "id from input",
    "originalWord": "original word",
    "correctedWord": "corrected English word in lowercase (e.g. 'protect')",
    "correctedMeaning": "accurate Vietnamese meaning",
    "partOfSpeech": "n | v | adj | adv | phr",
    "hasIssue": boolean
  }
]

RULES:
- Return exactly ${c.chunk.length} entries in order.
- Lowercase and trim all words.`;

      let text: string;
      try {
        text = await geminiGenerate(prompt, {
          temperature: 0.1,
          responseMimeType: 'application/json',
          signal,
        });
      } catch (apiErr) {
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        throw new Error(`Lỗi kết nối Gemini ở từ ${c.startIndex + 1} - ${c.startIndex + c.chunk.length} / ${total}: ${msg}`);
      }

      let parsed: Array<{
        id: string;
        originalWord: string;
        correctedWord: string;
        correctedMeaning: string;
        partOfSpeech: string;
        hasIssue: boolean;
      }>;

      try {
        parsed = cleanAndParseJSON<typeof parsed>(text);
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`Lỗi phân tích JSON ở từ ${c.startIndex + 1} - ${c.startIndex + c.chunk.length}: ${msg}`);
      }

      for (let j = 0; j < c.chunk.length; j++) {
        const vocab = c.chunk[j];
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

        let correctedWord = (item.correctedWord || vocab.word).trim().toLowerCase();
        const correctedMeaning = (item.correctedMeaning || vocab.meaning).trim();
        const correctedType = (item.partOfSpeech || vocab.type || '').trim().toLowerCase();

        // Heuristic check: triple repeated characters like "protecttt"
        const hasObviousRepetition = /(.)\1{2,}/i.test(vocab.word);
        if (hasObviousRepetition && correctedWord === vocab.word.trim().toLowerCase()) {
          correctedWord = vocab.word.trim().toLowerCase().replace(/(.)\1{2,}/g, '$1');
        }

        const wasChanged =
          item.hasIssue ??
          (correctedWord !== vocab.word.trim().toLowerCase() ||
            correctedMeaning !== vocab.meaning.trim() ||
            hasObviousRepetition);

        results.push({
          id: vocab.id,
          originalWord: vocab.word,
          correctedWord,
          correctedMeaning,
          partOfSpeech: correctedType,
          wasChanged,
        });
      }

      scanned += c.chunk.length;
      onProgress?.({
        scanned: Math.min(total, scanned),
        total,
        errorsFound: results.filter((r) => r.wasChanged).length,
        currentChunk: Math.min(totalChunks, Math.ceil(scanned / CHUNK_SIZE)),
        totalChunks,
      });

      if (nextChunkIdx < chunks.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker());
  await Promise.all(workers);

  // Mark cross-chunk duplicates
  const seenMap = new Map<string, string>();
  for (const r of results) {
    const existingId = seenMap.get(r.correctedWord);
    if (existingId && existingId !== r.id) {
      r.isDuplicateOf = existingId;
    } else {
      seenMap.set(r.correctedWord, r.id);
    }
  }

  return results;
}

// ============================================================================
// 5. CONTEXTUAL CLOZE TEST GENERATION (Active Recall)
// ============================================================================

/**
 * Generates contextual cloze test questions for a batch of vocabularies using Gemini AI.
 * Falls back gracefully to intelligent templates if AI generation fails or offline.
 */
export async function generateClozeQuestions(
  targetVocabs: Vocabulary[],
  allVocabs: Vocabulary[] = []
): Promise<ClozeQuestion[]> {
  if (targetVocabs.length === 0) return [];

  // Candidate companion words from the user's chest (excluding current targets)
  const candidateChestVocabs = allVocabs.filter(
    (v) => !targetVocabs.some((tv) => tv.id === v.id || tv.word.toLowerCase() === v.word.toLowerCase())
  );

  // Helper to detect and extract companion chest words appearing in a sentence
  const detectCompanionWords = (
    sentence: string,
    targetWord: string,
    candidates: Vocabulary[],
    suggestedWords?: string[]
  ): CompanionChestWord[] => {
    const result: CompanionChestWord[] = [];
    const seen = new Set<string>();
    const targetLower = targetWord.toLowerCase().trim();

    // 1. Check explicitly suggested words from AI
    if (Array.isArray(suggestedWords)) {
      for (const sw of suggestedWords) {
        const swClean = (sw || '').trim().toLowerCase();
        if (!swClean || swClean === targetLower || seen.has(swClean)) continue;
        const matched = candidates.find((c) => c.word.toLowerCase().trim() === swClean);
        if (matched) {
          seen.add(swClean);
          result.push({
            word: matched.word,
            meaning: matched.meaning,
            category: matched.category,
            type: matched.type,
          });
        }
      }
    }

    // 2. Scan sentence for whole-word matches against chest candidates
    for (const cand of candidates) {
      const candWord = cand.word.trim();
      const candLower = candWord.toLowerCase();
      // Skip very short words (<= 2 chars) to prevent false positives
      if (candLower.length <= 2 || candLower === targetLower || seen.has(candLower)) continue;

      const escaped = candWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(sentence)) {
        seen.add(candLower);
        result.push({
          word: cand.word,
          meaning: cand.meaning,
          category: cand.category,
          type: cand.type,
        });
      }
      if (result.length >= 3) break; // Keep up to 3 companion words per sentence for focused review
    }

    return result;
  };

  // Helper to get 3 distractors, prioritizing words from the user's chest
  const getRandomDistractors = (targetWord: string, targetVocab?: Vocabulary): string[] => {
    const targetLower = targetWord.toLowerCase().trim();
    const targetType = (targetVocab?.type || '').toLowerCase();
    const targetCat = (targetVocab?.category || '').toLowerCase();

    // 1. Prioritize words in the same category or of similar part of speech from user's chest
    const chestSameTypeOrCat = allVocabs.filter((v) => {
      const w = v.word.trim().toLowerCase();
      if (!w || w === targetLower) return false;
      const vt = (v.type || '').toLowerCase();
      const vc = (v.category || '').toLowerCase();
      return (
        (targetType && vt && (vt.includes(targetType) || targetType.includes(vt))) ||
        (targetCat && vc && vc === targetCat)
      );
    });

    // 2. Other words in the user's chest
    const otherChest = allVocabs.filter((v) => {
      const w = v.word.trim().toLowerCase();
      return w && w !== targetLower && !chestSameTypeOrCat.some((c) => c.id === v.id);
    });

    const shuffledSame = [...chestSameTypeOrCat].sort(() => Math.random() - 0.5);
    const shuffledOther = [...otherChest].sort(() => Math.random() - 0.5);

    const result: string[] = [];
    for (const item of [...shuffledSame, ...shuffledOther]) {
      const w = item.word.trim();
      if (!result.map((r) => r.toLowerCase()).includes(w.toLowerCase())) {
        result.push(w);
      }
      if (result.length >= 3) break;
    }

    const backupPool = [
      'protect', 'reduce', 'maintain', 'explore', 'create', 'improve',
      'decision', 'challenge', 'environment', 'solution', 'resource',
      'essential', 'natural', 'complex', 'significant', 'practical',
      'acquire', 'sustain', 'distribute', 'conclude', 'establish'
    ].filter((w) => w !== targetLower);

    while (result.length < 3) {
      const backupWord = backupPool[Math.floor(Math.random() * backupPool.length)];
      if (!result.includes(backupWord) && backupWord !== targetLower) {
        result.push(backupWord);
      }
    }
    return result.slice(0, 3);
  };

  // High-fidelity contextual fallback that embeds target word and chest companion words
  const fallbackQuestions = (vocabList: Vocabulary[]): ClozeQuestion[] => {
    return vocabList.map((v, i) => {
      const distractors = getRandomDistractors(v.word, v);
      const options = [v.word, ...distractors].sort(() => Math.random() - 0.5);
      const correctIndex = options.indexOf(v.word);
      const firstLetter = v.word.charAt(0).toUpperCase();

      // Pick a companion word from chest if available
      const companion = candidateChestVocabs.length > 0
        ? candidateChestVocabs[i % candidateChestVocabs.length]
        : null;

      const companionList: CompanionChestWord[] = companion
        ? [{ word: companion.word, meaning: companion.meaning, category: companion.category, type: companion.type }]
        : [];

      // Check if word has a cached authentic example sentence
      const cached = getExampleForWordFromCache(v.word);
      const escapedWord = v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');

      if (cached?.sentence && wordRegex.test(cached.sentence)) {
        const sentenceWithBlank = cached.sentence.replace(wordRegex, '______');
        const detected = detectCompanionWords(cached.sentence, v.word, candidateChestVocabs);
        return {
          vocab: v,
          sentenceWithBlank,
          fullSentence: cached.sentence,
          translation: cached.translation || `Câu ví dụ thực tế cho từ "${v.word}" (${v.meaning})`,
          hint: `Bắt đầu bằng: ${firstLetter}... | Nghĩa: ${v.meaning}`,
          options,
          correctIndex,
          companionChestWords: detected.length > 0 ? detected : companionList,
        };
      }

      // Contextual sentences by part of speech incorporating companion chest word when available
      const t = (v.type || '').toLowerCase();
      let sentenceWithBlank = '';
      let fullSentence = '';
      let translation = '';

      const compText = companion ? ` (${companion.word}: ${companion.meaning})` : '';

      if (t.includes('verb') || t.includes('động')) {
        if (companion) {
          sentenceWithBlank = `To foster better ${companion.word}, the team collaborated to ______ key challenges before launch.`;
          fullSentence = `To foster better ${companion.word}, the team collaborated to ${v.word} key challenges before launch.`;
          translation = `Để thúc đẩy ${companion.meaning} tốt hơn, nhóm đã phối hợp để ${v.meaning} các thách thức quan trọng trước khi ra mắt.`;
        } else {
          sentenceWithBlank = `The entire project team worked together to ______ all remaining challenges before launch.`;
          fullSentence = `The entire project team worked together to ${v.word} all remaining challenges before launch.`;
          translation = `Cả đội dự án đã cùng nhau làm việc để ${v.meaning} mọi khó khăn còn lại trước khi ra mắt.`;
        }
      } else if (t.includes('adj') || t.includes('tính')) {
        if (companion) {
          sentenceWithBlank = `Maintaining a ______ mindset helped them preserve ${companion.word} during the demanding crisis.`;
          fullSentence = `Maintaining a ${v.word} mindset helped them preserve ${companion.word} during the demanding crisis.`;
          translation = `Duy trì tư duy ${v.meaning} đã giúp họ bảo vệ ${companion.meaning} trong suốt cuộc khủng hoảng.`;
        } else {
          sentenceWithBlank = `Her ______ attitude and dedication inspired everyone during the demanding crisis.`;
          fullSentence = `Her ${v.word} attitude and dedication inspired everyone during the demanding crisis.`;
          translation = `Thái độ ${v.meaning} và sự tận tâm của cô ấy đã truyền cảm hứng cho mọi người trong suốt cuộc khủng hoảng.`;
        }
      } else if (t.includes('adv') || t.includes('trạng')) {
        if (companion) {
          sentenceWithBlank = `The specialist analyzed the ${companion.word} ______ to ensure complete accuracy before reporting.`;
          fullSentence = `The specialist analyzed the ${companion.word} ${v.word} to ensure complete accuracy before reporting.`;
          translation = `Chuyên gia đã phân tích ${companion.meaning} một cách ${v.meaning} để đảm bảo độ chính xác tuyệt đối trước khi báo cáo.`;
        } else {
          sentenceWithBlank = `The specialist analyzed the data ______ to ensure complete accuracy before reporting.`;
          fullSentence = `The specialist analyzed the data ${v.word} to ensure complete accuracy before reporting.`;
          translation = `Chuyên gia đã phân tích dữ liệu một cách ${v.meaning} để đảm bảo độ chính xác tuyệt đối trước khi báo cáo.`;
        }
      } else {
        if (companion) {
          sentenceWithBlank = `Building a clear ______ allowed the organization to achieve meaningful ${companion.word}.`;
          fullSentence = `Building a clear ${v.word} allowed the organization to achieve meaningful ${companion.word}.`;
          translation = `Xây dựng một ${v.meaning} rõ ràng đã cho phép tổ chức đạt được ${companion.meaning} có ý nghĩa.`;
        } else {
          sentenceWithBlank = `Establishing a strong foundation is an essential ______ for achieving meaningful success in life.`;
          fullSentence = `Establishing a strong foundation is an essential ${v.word} for achieving meaningful success in life.`;
          translation = `Xây dựng một nền tảng vững chắc là một ${v.meaning} thiết yếu để đạt được thành công có ý nghĩa trong cuộc sống.`;
        }
      }

      return {
        vocab: v,
        sentenceWithBlank,
        fullSentence,
        translation,
        hint: `Bắt đầu bằng: ${firstLetter}... | Nghĩa: ${v.meaning}${compText ? ` | Ôn kèm: ${companion?.word}` : ''}`,
        options,
        correctIndex,
        companionChestWords: companionList,
      };
    });
  };

  // If Gemini is not configured, directly return fallback
  if (!isGeminiConfigured()) {
    return fallbackQuestions(targetVocabs);
  }

  // Batch targetVocabs in chunks of 5 for speed, quota efficiency, and parallel completion
  const BATCH_SIZE = 5;
  const batches: Vocabulary[][] = [];
  for (let i = 0; i < targetVocabs.length; i += BATCH_SIZE) {
    batches.push(targetVocabs.slice(i, i + BATCH_SIZE));
  }

  try {
    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        try {
          const itemsText = batch
            .map(
              (v, idx) =>
                `${idx + 1}. id="${v.id}" Word: "${v.word}", Type: "${v.type || 'word'}", Meaning: "${v.meaning}", Category: "${v.category || 'General'}"`
            )
            .join('\n');

          // Select up to 15 diverse companion words from the user's chest to offer Gemini
          const batchExcluded = new Set(batch.map((b) => b.word.toLowerCase().trim()));
          const chestPool = allVocabs.filter(
            (v) => !batchExcluded.has(v.word.toLowerCase().trim())
          );
          const shuffledChest = [...chestPool].sort(() => Math.random() - 0.5);
          const companionSample = shuffledChest.slice(0, 15);
          const companionSampleText =
            companionSample.length > 0
              ? companionSample.map((c) => `"${c.word}" (${c.meaning})`).join(', ')
              : 'None available';

          const prompt = `You are an expert English language examiner creating Contextual Cloze Deletion Test (đục lỗ ngữ cảnh) questions for English learners.

For each vocabulary entry below, create a natural, realistic English sentence that uses the word in a clear, meaningful, real-life context (workplace, academics, daily life, social interactions).
Replace the target word in the sentence with "______" (6 underscores).

SPECIAL PEDAGOGICAL FEATURE - REINFORCE USER'S PERSONAL VOCABULARY CHEST:
The user has a personal vocabulary chest with the following words they are actively learning:
[ ${companionSampleText} ]

INSTRUCTION FOR VOCABULARY REINFORCEMENT:
Whenever natural, fluent, and grammatically appropriate, WEAVE 1 OR 2 of these chest vocabulary words into each sentence context (outside the blank).
This allows the learner to encounter and review multiple words from their chest simultaneously in an authentic situation!
If a companion chest word is used, list it in the "companionChestWords" field. (Do not force words if they sound unnatural).

CRITICAL PEDAGOGICAL RULES:
- The sentence MUST be a real, meaningful English scenario (dialogue, action, narration) where the target word fits naturally.
- NEVER write meta-sentences defining the word (e.g. NEVER write "The word ______ means..." or "Learning ______ is helpful"). The word must be an organic part of the sentence itself.
- In "fullSentence", include the target word in the exact form provided.
- In "sentenceWithBlank", replace ONLY the target word with "______" (6 underscores). Keep punctuation intact.
- In "companionChestWords", output an array of string words from the user's chest that appear in the sentence (excluding the target word).
- Provide a clear, natural Vietnamese translation of the full sentence.
- Provide a helpful contextual hint in Vietnamese (describing the context clue or situational meaning).
- Provide exactly 3 different English words (distractors) of the same part of speech that are plausible in general English, but incorrect in this specific context.
- Return exactly ${batch.length} items in the same order as input.

Target Vocabulary list:
${itemsText}

Return strictly a JSON array matching this schema:
[
  {
    "id": "the entry id from input",
    "sentenceWithBlank": "Despite facing numerous setbacks, the community proved to be remarkably ______ and rebuilt their homes quickly.",
    "fullSentence": "Despite facing numerous setbacks, the community proved to be remarkably resilient and rebuilt their homes quickly.",
    "translation": "Dù phải đối mặt với nhiều thất bại, cộng đồng đã tỏ ra vô cùng kiên cường và nhanh chóng xây dựng lại nhà cửa.",
    "hint": "Khả năng phục hồi nhanh chóng sau khó khăn hoặc tổn thất",
    "companionChestWords": ["setbacks"],
    "distractors": ["fragile", "vulnerable", "hesitant"]
  }
]`;

          const text = await geminiGenerate(prompt, {
            temperature: 0.25,
            responseMimeType: 'application/json',
          });

          const parsed = cleanAndParseJSON<Array<{
            id: string;
            sentenceWithBlank: string;
            fullSentence: string;
            translation: string;
            hint: string;
            companionChestWords?: string[];
            distractors?: string[];
          }>>(text);

          if (!Array.isArray(parsed) || parsed.length === 0) {
            return fallbackQuestions(batch);
          }

          return batch.map((vocab, idx) => {
            const generated = parsed.find((p) => p.id === vocab.id) || parsed[idx];
            if (!generated || !generated.sentenceWithBlank || !generated.fullSentence) {
              return fallbackQuestions([vocab])[0];
            }

            let sentenceWithBlank = (generated.sentenceWithBlank || '').trim();
            let fullSentence = (generated.fullSentence || '').trim();

            // Normalize blank placeholder
            const blankRegex = /(?:_{3,}|\[blank\]|<blank>|\(\.{3,}\)|\.{3,})/i;
            if (blankRegex.test(sentenceWithBlank)) {
              sentenceWithBlank = sentenceWithBlank.replace(blankRegex, '______');
            } else {
              const escapedWord = vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
              if (wordRegex.test(sentenceWithBlank)) {
                sentenceWithBlank = sentenceWithBlank.replace(wordRegex, '______');
              } else if (wordRegex.test(fullSentence)) {
                sentenceWithBlank = fullSentence.replace(wordRegex, '______');
              }
            }

            // Ensure fullSentence actually contains the target word
            if (fullSentence.includes('______')) {
              fullSentence = fullSentence.replace(/______/g, vocab.word);
            }

            // Ensure distractor words exist and don't contain the target word
            let distractors = Array.isArray(generated.distractors) && generated.distractors.length >= 3
              ? generated.distractors.slice(0, 3)
              : getRandomDistractors(vocab.word, vocab);

            distractors = distractors.filter((d) => d.toLowerCase() !== vocab.word.toLowerCase());
            while (distractors.length < 3) {
              const extra = getRandomDistractors(vocab.word, vocab);
              for (const item of extra) {
                if (!distractors.includes(item) && item.toLowerCase() !== vocab.word.toLowerCase()) {
                  distractors.push(item);
                }
              }
            }
            distractors = distractors.slice(0, 3);

            const options = [vocab.word, ...distractors].sort(() => Math.random() - 0.5);
            const correctIndex = options.indexOf(vocab.word);

            // Detect and collect all companion chest words present in the full sentence
            const companionChestWords = detectCompanionWords(
              fullSentence,
              vocab.word,
              candidateChestVocabs,
              generated.companionChestWords
            );

            return {
              vocab,
              sentenceWithBlank,
              fullSentence,
              translation: generated.translation || '',
              hint: generated.hint || vocab.meaning,
              options,
              correctIndex,
              companionChestWords,
            };
          });
        } catch (batchErr) {
          console.warn('[GeminiService] Batch generation failed, falling back to smart local context for this batch:', batchErr);
          return fallbackQuestions(batch);
        }
      })
    );

    const flattened = batchResults.flat();
    return flattened.length > 0 ? flattened : fallbackQuestions(targetVocabs);
  } catch (err) {
    console.warn('[GeminiService] generateClozeQuestions failed, falling back to local questions:', err);
    return fallbackQuestions(targetVocabs);
  }
}

/**
 * Generates 2 natural, high-frequency collocations/phrasal pairings for a single vocabulary word.
 * Caches result in localStorage to conserve quota and ensure instant recall.
 */
export async function fetchCollocationsForWord(
  word: string,
  meaning?: string,
  type?: string
): Promise<CollocationItem[]> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return [];

  // Check cache first
  const cached = getCollocationsForWordFromCache(normalized);
  if (cached && cached.length > 0) {
    return cached;
  }

  if (!isGeminiConfigured()) {
    return [];
  }

  const prompt = `You are an expert lexicographer and English teacher.
Provide the top 2 most common, natural collocations or phrasal pairings for this English word: "${normalized}" (Type: "${type || ''}", Vietnamese meaning: "${meaning || ''}").
Rules:
- Give exactly 2 high-frequency, natural collocations/pairings (e.g. for "waste" -> "toxic waste" (chất thải độc hại) and "reduce waste" (giảm thiểu rác thải)).
- Provide a clear, natural Vietnamese meaning for each phrase.
- Return strictly a JSON array matching:
[
  { "phrase": "example phrase", "meaning": "nghĩa tiếng Việt" },
  { "phrase": "another phrase", "meaning": "nghĩa tiếng Việt" }
]`;

  try {
    const text = await geminiGenerate(prompt, {
      temperature: 0.2,
      responseMimeType: 'application/json',
    });
    const parsed = cleanAndParseJSON<CollocationItem[]>(text);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed
        .filter((item) => item && typeof item.phrase === 'string' && item.phrase.trim())
        .map((item) => ({
          phrase: item.phrase.trim(),
          meaning: (item.meaning || '').trim(),
        }))
        .slice(0, 2);

      if (valid.length > 0) {
        saveCollocationsForWordToCache(normalized, valid);
        return valid;
      }
    }
  } catch (err) {
    console.warn(`[GeminiService] fetchCollocationsForWord failed for "${word}":`, err);
  }

  return [];
}

/**
 * Batch generates 2 natural collocations for a list of words.
 * Batches in chunks of 15 items to optimize quota and speed.
 * Skips words that already have cached collocations.
 */
export async function batchFetchCollocations(
  words: Array<{ id: string; word: string; meaning?: string; type?: string }>,
  options?: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<Record<string, CollocationItem[]>> {
  const result: Record<string, CollocationItem[]> = {};
  if (!words || words.length === 0) return result;

  const toFetch: Array<{ id: string; word: string; meaning?: string; type?: string }> = [];

  // Check cache first for all items
  for (const item of words) {
    const key = item.word.trim().toLowerCase();
    if (!key) continue;
    const cached = getCollocationsForWordFromCache(key);
    if (cached && cached.length > 0) {
      result[key] = cached;
    } else {
      toFetch.push(item);
    }
  }

  const total = words.length;
  let done = Object.keys(result).length;
  options?.onProgress?.(done, total);

  if (toFetch.length === 0 || !isGeminiConfigured()) {
    return result;
  }

  // Deduplicate words to fetch by lowercased word
  const uniqueToFetchMap = new Map<string, { id: string; word: string; meaning?: string; type?: string }>();
  for (const item of toFetch) {
    const key = item.word.trim().toLowerCase();
    if (!uniqueToFetchMap.has(key)) {
      uniqueToFetchMap.set(key, item);
    }
  }
  const uniqueToFetch = Array.from(uniqueToFetchMap.values());

  const CHUNK = 15;
  for (let i = 0; i < uniqueToFetch.length; i += CHUNK) {
    if (options?.signal?.aborted) {
      break;
    }

    const chunk = uniqueToFetch.slice(i, i + CHUNK);
    const chunkItemsText = chunk
      .map(
        (v, idx) =>
          `${idx + 1}. Word: "${v.word.trim().toLowerCase()}", Type: "${v.type || ''}", Meaning: "${v.meaning || ''}"`
      )
      .join('\n');

    const prompt = `You are an expert lexicographer and English teacher.
For each vocabulary word below, provide the top 2 most common, natural collocations or phrasal pairings used by native speakers.
Include a clear, concise Vietnamese meaning for each collocation.

Vocabulary list:
${chunkItemsText}

Return strictly a JSON array matching this schema:
[
  {
    "word": "waste",
    "collocations": [
      { "phrase": "toxic waste", "meaning": "chất thải độc hại" },
      { "phrase": "reduce waste", "meaning": "giảm thiểu rác thải" }
    ]
  }
]

CRITICAL RULES:
- Return exactly ${chunk.length} items.
- "collocations" must be an array of exactly 2 items with "phrase" and "meaning".
- Do NOT include markdown commentary outside the JSON array.`;

    try {
      const text = await geminiGenerate(prompt, {
        temperature: 0.2,
        responseMimeType: 'application/json',
        signal: options?.signal,
      });

      const parsed = cleanAndParseJSON<Array<{
        word: string;
        collocations: CollocationItem[];
      }>>(text);

      if (Array.isArray(parsed)) {
        const batchNew: Record<string, CollocationItem[]> = {};
        for (const entry of parsed) {
          if (entry && entry.word && Array.isArray(entry.collocations)) {
            const wKey = entry.word.trim().toLowerCase();
            const validCols = entry.collocations
              .filter((c) => c && typeof c.phrase === 'string' && c.phrase.trim())
              .map((c) => ({ phrase: c.phrase.trim(), meaning: (c.meaning || '').trim() }))
              .slice(0, 2);

            if (validCols.length > 0) {
              batchNew[wKey] = validCols;
              result[wKey] = validCols;
            }
          }
        }
        saveBatchCollocationsToCache(batchNew);
      }
    } catch (err) {
      if (options?.signal?.aborted) break;
      console.warn('[GeminiService] batchFetchCollocations chunk failed:', err);
    }

    done = Math.min(total, done + chunk.length);
    options?.onProgress?.(done, total);
  }

  return result;
}

// ============================================================================
// 7. SINGLE VOCABULARY CONTEXT / EXAMPLE SENTENCE GENERATION (Vlog Style)
// ============================================================================

export interface VocabExampleResult {
  sentence: string;
  translation: string;
}

export async function fetchExampleSentenceForWord(
  word: string,
  meaning: string = '',
  type: string = ''
): Promise<VocabExampleResult | null> {
  if (!word || !isGeminiConfigured()) return null;

  const prompt = `You are a creative English teacher and storyteller.
Write exactly ONE natural, vivid, real-life English example sentence containing the target word: "${word.trim()}" (Part of speech: "${type || ''}", Vietnamese meaning: "${meaning || ''}").
The sentence should feel conversational, memorable, and contextual like a dialogue or narration from an authentic vlog.
Also provide its accurate, natural Vietnamese translation.
Return strictly a JSON object:
{
  "sentence": "English sentence containing the target word",
  "translation": "Bản dịch tiếng Việt tự nhiên của câu trên"
}`;

  try {
    const text = await geminiGenerate(prompt, {
      temperature: 0.3,
      responseMimeType: 'application/json',
    });
    const parsed = cleanAndParseJSON<VocabExampleResult>(text);
    if (parsed && typeof parsed.sentence === 'string' && parsed.sentence.trim()) {
      return {
        sentence: parsed.sentence.trim(),
        translation: (parsed.translation || '').trim(),
      };
    }
  } catch (err) {
    console.warn(`[GeminiService] fetchExampleSentenceForWord failed for "${word}":`, err);
  }
  return null;
}
