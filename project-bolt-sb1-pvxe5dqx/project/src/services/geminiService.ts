import type { Language } from '@/lib/types';
import type { GrammarEvaluation, DetectedError, NativeAlternative, ErrorType } from '@/lib/grammarCheck';

// ============================================================================
// GEMINI SERVICE: Single Source of Truth for all Gemini API Interactions
// Target Model: Exclusively gemini-2.0-flash
// Authentication: Exclusively via x-goog-api-key header (NO Bearer, NO query params)
// Key Resolution: localStorage('vocabmaster_gemini_api_key') -> import.meta.env.VITE_GEMINI_API_KEY
// Request Batching: 15 items per prompt (CHUNK_SIZE = 15)
// ============================================================================

export const USER_KEY_STORAGE = 'vocabmaster_gemini_api_key';
export const TARGET_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_MODEL = 'gemini-3.5-flash';
export const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const CHUNK_SIZE = 20; // 20 items per prompt for optimal throughput & quota efficiency

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
    name: 'gemini-3.5-flash-lite (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  },
  {
    name: 'gemini-3.5-flash (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
  },
  {
    name: 'gemini-flash-lite-latest (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
  },
  {
    name: 'gemini-3.1-flash-lite (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
  },
  {
    name: 'gemma-4-26b-a4b-it (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent',
  },
  {
    name: 'gemini-3.8-flash (v1beta)',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
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
            if (m.name && m.supportedGenerationMethods?.includes('generateContent')) {
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

  // Prioritize flash models
  return discovered.sort((a, b) => {
    const aFlash = a.name.includes('flash') ? 1 : 0;
    const bFlash = b.name.includes('flash') ? 1 : 0;
    return bFlash - aFlash;
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

  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    if (signal?.aborted) {
      throw new Error('Đã hủy quá trình kiểm tra.');
    }

    const chunk = vocabs.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;

    // Small delay between chunks to respect API rate limits (avoiding HTTP 429)
    if (i > 0) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 1200);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject(new Error('Đã hủy quá trình kiểm tra.'));
            },
            { once: true }
          );
        }
      });
    }

    const entriesText = chunk
      .map(
        (e, idx) =>
          `${idx + 1}. [id="${e.id}"] Word: "${e.word}", Meaning: "${e.meaning}", Type: "${e.type || ''}"`
      )
      .join('\n');

    const prompt = `You are a strict English lexicographer and dictionary spellchecker.
Analyze this list of English-Vietnamese vocabulary pairs. Identify any English spelling errors, non-existent words, typos, meaning mismatches, or invalid parts of speech.

Input entries:
${entriesText}

CRITICAL SPELLCHECK RULES:
1. Scrutinize EVERY letter of every word for typos and extra characters:
   - "protecttt" (extra 't's) -> MUST fix to "protect", set hasIssue: true
   - "protectet" (misspelling) -> MUST fix to "protect", set hasIssue: true
   - "enviroment" -> MUST fix to "environment", set hasIssue: true
   - "definitiely" -> MUST fix to "definitely", set hasIssue: true
   - "succesful" -> MUST fix to "successful", set hasIssue: true
   - Any word with repeated characters, typos, or slang MUST be corrected to its canonical dictionary form.
2. Meaning verification:
   - If the Vietnamese translation does not match the English word (e.g., word "apple" but meaning "Bảo vệ"), correct meaning to "Quả táo" and set hasIssue: true.
3. If an entry is already 100% correct in spelling, meaning, and part of speech, set hasIssue: false.
4. Return exactly ${chunk.length} entries in the same order.
5. All correctedWord values must be in lowercase and trimmed.

Respond strictly in JSON array format:
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

    // DO NOT SILENTLY CATCH: propagate errors with context so caller can show red Toast
    let text: string;
    try {
      text = await geminiGenerate(prompt, {
        temperature: 0.1,
        responseMimeType: 'application/json',
        signal,
      });
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      throw new Error(`Lỗi kết nối Gemini ở từ ${i + 1} - ${i + chunk.length} / ${total}: ${msg}`);
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
      throw new Error(`Lỗi phân tích JSON ở từ ${i + 1} - ${i + chunk.length}: ${msg}`);
    }

    for (let j = 0; j < chunk.length; j++) {
      const orig = chunk[j];
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

    scanned += chunk.length;
    onProgress?.({
      scanned,
      total,
      errorsFound: items.length,
      currentChunk: chunkIndex,
      totalChunks,
    });
  }

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
  const correctedWordMap = new Map<string, string>(); // lowercase word -> first id
  let scanned = 0;
  const total = vocabs.length;
  const totalChunks = Math.ceil(total / CHUNK_SIZE);

  for (let i = 0; i < vocabs.length; i += CHUNK_SIZE) {
    if (signal?.aborted) {
      throw new Error('Đã hủy quá trình kiểm tra.');
    }

    const chunk = vocabs.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;

    if (i > 0) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 800);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject(new Error('Đã hủy quá trình kiểm tra.'));
            },
            { once: true }
          );
        }
      });
    }

    const entriesText = chunk
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
- Return exactly ${chunk.length} entries in order.
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
      throw new Error(`Lỗi kết nối Gemini ở từ ${i + 1} - ${i + chunk.length} / ${total}: ${msg}`);
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
      throw new Error(`Lỗi phân tích JSON ở từ ${i + 1} - ${i + chunk.length}: ${msg}`);
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

      let correctedWord = (item.correctedWord || vocab.word).trim().toLowerCase();
      const correctedMeaning = (item.correctedMeaning || vocab.meaning).trim();
      const correctedType = (item.partOfSpeech || vocab.type || '').trim().toLowerCase();

      // Heuristic check: triple repeated characters like "protecttt"
      const hasObviousRepetition = /(.)\1{2,}/i.test(vocab.word);
      if (hasObviousRepetition && correctedWord === vocab.word.trim().toLowerCase()) {
        correctedWord = vocab.word.trim().toLowerCase().replace(/(.)\1{2,}/g, '$1');
      }

      const isDuplicateOf = correctedWordMap.get(correctedWord);
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
        isDuplicateOf,
      });

      if (!isDuplicateOf) {
        correctedWordMap.set(correctedWord, vocab.id);
      }
    }

    scanned += chunk.length;
    onProgress?.({
      scanned,
      total,
      errorsFound: results.filter((r) => r.wasChanged).length,
      currentChunk: chunkIndex,
      totalChunks,
    });
  }

  return results;
}
