'use strict';

const HF_API_URL =
  process.env.HF_API_URL || 'https://router.huggingface.co/v1/chat/completions';
const HF_CHAT_MODEL =
  process.env.HF_CHAT_MODEL || 'Qwen/Qwen3-4B-Instruct-2507';
const HF_MAX_TOKENS = Number(process.env.HF_MAX_TOKENS) || 160;
const HF_HISTORY_TURNS = Number(process.env.HF_HISTORY_TURNS) || 4;
// Bail to local context if HF is slow — keeps fallback UX near the main chat budget.
const HF_TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS) || 1200;
// When true and chunks exist, skip HF and answer from local context instantly.
// Default false = always try HF first on Gemini quota errors.
const HF_SKIP_WHEN_CONTEXT = ['1', 'true', 'yes'].includes(
  String(process.env.HF_SKIP_WHEN_CONTEXT || '')
    .trim()
    .toLowerCase()
);

function getHuggingFaceToken() {
  return process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '';
}

function stripEmojis(text) {
  return String(text || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function truncate(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1).trimEnd() + '…';
}

function buildLeanSystemInstruction(systemInstruction, chunks) {
  // Prefer a short prompt built from already-selected chunks over the full Gemini system text.
  if (Array.isArray(chunks) && chunks.length) {
    const context = chunks
      .slice(0, 3)
      .map((c) => truncate(c.title + ': ' + c.content, 700))
      .join('\n');

    return (
      "You are Noman's AI on his portfolio. Be warm and concise (2-4 sentences). " +
      'Use CONTEXT for facts about Noman; do not invent. No emoji. Text tone only (:3, :)). ' +
      'His CURRENT job is Software Quality Assurance Engineer (Full-Time) at Nexbild Technologies Bangladesh Ltd. ' +
      'SJ Innovation and earlier roles are PAST only.\n\n' +
      'CONTEXT:\n' +
      context
    );
  }

  return truncate(
    String(systemInstruction || '') +
      '\n\nSTRICT: No emoji. Keep replies short (2-4 sentences).',
    2500
  );
}

function buildDirectContextAnswer(chunks, userMessage) {
  const top = (chunks || []).slice(0, 2);
  if (!top.length) {
    return (
      'The assistant is temporarily unavailable (main model quota + backup model). ' +
      'Please try again in about a minute.'
    );
  }

  const snippets = top
    .map((chunk) => {
      const content = String(chunk.content || '')
        .replace(/\s+/g, ' ')
        .trim();
      const firstBeat = content.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      return truncate(firstBeat || content, 280);
    })
    .filter(Boolean);

  const lead = userMessage
    ? 'Gemini is briefly rate-limited, so here is the closest portfolio info: '
    : 'The main model is rate-limited, so here are the closest portfolio details: ';

  return lead + snippets.join(' ');
}

function toOpenAiHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .slice(-HF_HISTORY_TURNS)
    .map((entry) => {
      const role = entry && entry.role === 'model' ? 'assistant' : 'user';
      const text = String((entry && entry.text) || '').trim();
      if (!text) return null;
      return { role, content: text.slice(0, 800) };
    })
    .filter(Boolean);
}

async function generateHuggingFaceAnswer(systemInstruction, userMessage, history, chunks) {
  const token = getHuggingFaceToken();
  if (!token) {
    return null;
  }

  const leanSystem = buildLeanSystemInstruction(systemInstruction, chunks);
  const messages = [
    { role: 'system', content: leanSystem },
    ...toOpenAiHistory(history),
    { role: 'user', content: String(userMessage || '').slice(0, 1000) },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: HF_CHAT_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: HF_MAX_TOKENS,
        // Harmless on Instruct-2507; helps if a thinking-capable Qwen is configured.
        enable_thinking: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Hugging Face returned non-JSON: ' + raw.slice(0, 200));
    }

    if (!response.ok) {
      const detail =
        (payload && (payload.error?.message || payload.error || payload.message)) ||
        raw.slice(0, 200) ||
        response.statusText;
      throw new Error('Hugging Face HTTP ' + response.status + ': ' + detail);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content || !String(content).trim()) {
      throw new Error('Hugging Face response did not include message content.');
    }

    return stripEmojis(content);
  } finally {
    clearTimeout(timer);
  }
}

async function generateQuotaFallback({
  systemInstruction,
  userMessage,
  history,
  chunks,
}) {
  // Instant path: portfolio context is already selected — no HF round-trip.
  if (HF_SKIP_WHEN_CONTEXT && chunks && chunks.length) {
    console.warn('[chat] Gemini quota; using instant local portfolio context.');
    return buildDirectContextAnswer(chunks, userMessage);
  }

  try {
    const hfAnswer = await generateHuggingFaceAnswer(
      systemInstruction,
      userMessage,
      history,
      chunks
    );
    if (hfAnswer) {
      console.warn('[chat] Using Hugging Face fallback model:', HF_CHAT_MODEL);
      return hfAnswer;
    }
    console.warn('[chat] HF_TOKEN not set; skipping Hugging Face fallback.');
  } catch (err) {
    const aborted =
      err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || '')));
    if (aborted) {
      console.warn(
        '[chat] Hugging Face fallback timed out after ' + HF_TIMEOUT_MS + 'ms; using local context.'
      );
    } else {
      console.warn('[chat] Hugging Face fallback failed:', err.message || err);
    }
  }

  if (chunks && chunks.length) {
    return buildDirectContextAnswer(chunks, userMessage);
  }

  return (
    'The assistant is temporarily unavailable (main model quota + backup model). ' +
    'Please try again in about a minute.'
  );
}

module.exports = {
  buildDirectContextAnswer,
  generateHuggingFaceAnswer,
  generateQuotaFallback,
  getHuggingFaceToken,
  stripEmojis,
};
