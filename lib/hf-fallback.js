'use strict';

const HF_API_URL =
  process.env.HF_API_URL || 'https://router.huggingface.co/v1/chat/completions';
const HF_CHAT_MODEL =
  process.env.HF_CHAT_MODEL || 'Qwen/Qwen3-4B-Instruct-2507';

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

function buildDirectContextAnswer(chunks) {
  const summaries = chunks
    .slice(0, 2)
    .map((chunk) => chunk.title + ': ' + chunk.content)
    .join(' ');

  return (
    'The main model is rate-limited, so here are the closest portfolio details: ' +
    summaries
  );
}

function toOpenAiHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .slice(-8)
    .map((entry) => {
      const role = entry && entry.role === 'model' ? 'assistant' : 'user';
      const text = String((entry && entry.text) || '').trim();
      if (!text) return null;
      return { role, content: text.slice(0, 2000) };
    })
    .filter(Boolean);
}

async function generateHuggingFaceAnswer(systemInstruction, userMessage, history) {
  const token = getHuggingFaceToken();
  if (!token) {
    return null;
  }

  const noEmojiInstruction =
    systemInstruction +
    '\n\nSTRICT STYLE RULE: Do not output any emoji characters at all. ' +
    'Use text emoticons only when needed, like :3 or :).';

  const messages = [
    { role: 'system', content: noEmojiInstruction },
    ...toOpenAiHistory(history),
    { role: 'user', content: userMessage },
  ];

  const response = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HF_CHAT_MODEL,
      messages,
      temperature: 0.85,
      max_tokens: 1024,
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
}

async function generateQuotaFallback({
  systemInstruction,
  userMessage,
  history,
  chunks,
}) {
  try {
    const hfAnswer = await generateHuggingFaceAnswer(
      systemInstruction,
      userMessage,
      history
    );
    if (hfAnswer) {
      console.warn('[chat] Using Hugging Face fallback model:', HF_CHAT_MODEL);
      return hfAnswer;
    }
    console.warn('[chat] HF_TOKEN not set; skipping Hugging Face fallback.');
  } catch (err) {
    console.warn('[chat] Hugging Face fallback failed:', err.message || err);
  }

  if (chunks && chunks.length) {
    return buildDirectContextAnswer(chunks);
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
