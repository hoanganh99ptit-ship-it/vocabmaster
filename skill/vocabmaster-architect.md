# AGENT SKILLS & ARCHITECTURE RULES: VOCABMASTER

## 1. Role & Identity
You are an expert Full-stack TypeScript & AI Engineer specializing in React, Tailwind CSS, Supabase, and Google Gemini integrations. You are refactoring, stabilizing, and upgrading an existing codebase originally exported from Bolt.new.

---

## 2. Gemini API Strict Protocols

### Model Target
- Exclusively use `gemini-2.0-flash`.
- Do not add automatic fallback loops to deprecated models (such as `gemini-1.5-flash` or `gemini-pro`).

### Authentication & Headers
- Pass the API Key **exclusively** via the `x-goog-api-key` HTTP header.
- **FORBIDDEN:**
  - `Authorization: Bearer <key>` (Triggers Google OAuth2 credential rejection).
  - Dual authentication (Do NOT combine URL query `?key=` with the `x-goog-api-key` header).
- Clean Endpoint:
  ```ts
  const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  ```

### Key Resolution Hierarchy
1. User-defined key stored in browser storage: `localStorage.getItem('vocabmaster_gemini_api_key')`
2. Legacy user storage fallback: `localStorage.getItem('user_gemini_api_key')`
3. Environment variable fallback: `import.meta.env.VITE_GEMINI_API_KEY`
4. If missing, prompt the user through the API Settings Modal instead of silently failing.

### Request Batching & Payload Constraints
- When executing bulk vocabulary operations (e.g., spelling cleanups, bulk auto-tagging):
  - Slice word lists into chunks of **at most 15–20 words** per API request.
  - Never send an entire library (e.g., 600+ entries) in a single prompt to avoid request timeouts and token overflows.

---

## 3. Architecture & Refactoring Directives

### Single Source of Truth
- All network calls to Google Gemini **MUST** reside exclusively in `src/services/geminiService.ts`.
- **NEVER** write inline `fetch()` or `axios` calls within React UI components (`VocabularyList.tsx`, `SentencePractice.tsx`, etc.).
- UI components must only call typed service functions (e.g., `geminiService.cleanupWords(words)`).

### State & Database Synchronization
- **Optimistic UI Updates:** Always update local React state and storage immediately before or concurrently with background API validation.
- **Rollback & Error Catching:** Always wrap asynchronous mutations in explicit `try...catch` blocks.
- **Toast Notifications:** Never swallow errors silently. Always display actual error details to the user using Toast alerts (`toast.error(...)`).

### Production Quality (No Mocking)
- Do not write mock arrays, fake timeouts, or hardcoded dummy checks that simulate AI operations (e.g., static `hasIssue = false`).
- Always process real payloads and enforce actual database writes (`supabase.from('words').upsert(...)` or synchronized local persistence).

---

## 4. Standard Gemini Service Implementation Pattern

```typescript
export interface WordItem {
  id: string;
  word: string;
  meaning: string;
  partOfSpeech?: string;
  category?: string;
}

export const getActiveApiKey = (): string => {
  const storedKey = 
    localStorage.getItem('vocabmaster_gemini_api_key') ||
    localStorage.getItem('user_gemini_api_key') ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    '';
  return storedKey.trim();
};

export const callGeminiFlash = async (promptText: string): Promise<string> => {
  const apiKey = getActiveApiKey();
  if (!apiKey) {
    throw new Error("Chưa cấu hình API Key. Vui lòng cài đặt API Key trong menu.");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    }
  );

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Gemini API Error [${response.status}]: ${errorDetails}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
};
```

---

## 5. Next Upgrade Roadmap

1. **Vocabulary Sanitization & Deduplication:**
   - Enforce lowercase trimming for all inputs (`word.trim().toLowerCase()`).
   - Automatically detect and merge duplicate entries during import or AI cleanup.
2. **Spaced Repetition System (SRS):**
   - Integrate SM-2 / FSRS scheduling fields into word entities:
     - `interval`: number (days until next review)
     - `easeFactor`: number (default: 2.5)
     - `repetitions`: number
     - `dueDate`: ISO date string
3. **Advanced Sentence Practice Evaluator:**
   - Require structured JSON evaluation response containing:
     - `isCorrect`: boolean
     - `grammarScore`: number (0 - 100)
     - `naturalnessScore`: number (0 - 100)
     - `detailedCritique`: string
     - `betterAlternatives`: string[]