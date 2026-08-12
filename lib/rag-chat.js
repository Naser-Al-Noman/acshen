'use strict';

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const { generateQuotaFallback, stripEmojis } = require('./hf-fallback');

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
// Alias that tracks Google's current fastest Flash-Lite. Override with GEMINI_CHAT_MODEL if needed.
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-flash-lite-latest';
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 160;
const HISTORY_TURNS = Number(process.env.CHAT_HISTORY_TURNS) || 4;
const MAX_LOCAL_CHUNKS = Number(process.env.CHAT_MAX_LOCAL_CHUNKS) || 3;
const VECTOR_THRESHOLD = Number(process.env.CHAT_VECTOR_THRESHOLD) || 0.45;
const USE_VECTOR_SEARCH = !['0', 'false', 'no'].includes(
  String(process.env.CHAT_USE_VECTOR_SEARCH ?? 'true')
    .trim()
    .toLowerCase()
);
// local = precomputed embeddings in repo (fast). supabase = embed + RPC (slower).
const VECTOR_BACKEND = String(process.env.CHAT_VECTOR_BACKEND || 'local')
  .trim()
  .toLowerCase();

let aiClient;
let supabaseClient;
let localChunksCache;
let embeddedChunksCache;

function getAi() {
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  // Trigger workers may run on Node < 22 without native WebSocket.
  // Supabase realtime init requires a WebSocket implementation.
  let transport;
  try {
    transport = require('ws');
  } catch {
    transport = undefined;
  }

  supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    realtime: transport ? { transport } : undefined,
  });
  return supabaseClient;
}

function loadEmbeddedChunks() {
  if (embeddedChunksCache) return embeddedChunksCache;

  const filePath = path.join(__dirname, '..', 'data', 'portfolio-embeddings.json');
  if (!fs.existsSync(filePath)) {
    embeddedChunksCache = null;
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  embeddedChunksCache = Array.isArray(raw.chunks) ? raw.chunks : [];
  return embeddedChunksCache;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

function retrieveLocalVector(queryEmbedding, matchCount, threshold) {
  const chunks = loadEmbeddedChunks();
  if (!chunks || !chunks.length) return null;

  const scored = chunks.map((chunk) => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);

  const top = scored.filter((s) => s.similarity >= threshold).slice(0, matchCount);
  if (top.length) {
    return top.map((s) => ({
      id: s.chunk.id,
      title: s.chunk.title,
      section: s.chunk.section,
      content: s.chunk.content,
      metadata: s.chunk.metadata,
      similarity: s.similarity,
    }));
  }

  const best = scored[0];
  if (!best) return [];

  return [
    {
      id: best.chunk.id,
      title: best.chunk.title,
      section: best.chunk.section,
      content: best.chunk.content,
      metadata: best.chunk.metadata,
      similarity: best.similarity,
    },
  ];
}

function loadLocalChunks() {
  if (localChunksCache) return localChunksCache;

  const filePath = path.join(__dirname, '..', 'data', 'portfolio-chunks.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  localChunksCache = Array.isArray(raw.chunks) ? raw.chunks : [];
  return localChunksCache;
}

/**
 * Warm clients and caches on serverless cold start so the first chat is faster.
 */
function warmupChat() {
  getAi();
  loadLocalChunks();
  if (USE_VECTOR_SEARCH && VECTOR_BACKEND === 'local') {
    loadEmbeddedChunks();
  }
}

/** Pre-warm the embed API so the first vector-search request is faster. */
async function warmupEmbed() {
  if (!USE_VECTOR_SEARCH) return;
  try {
    await embedQuery('portfolio warmup');
  } catch {
    // Non-fatal — first user request will retry embed.
  }
}

function isQuotaError(err) {
  const message = String((err && err.message) || err || '').toLowerCase();
  return (
    message.includes('resource_exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('"code":429') ||
    message.includes('retrydelay')
  );
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Local retrieval — no embed/API. Keeps prompt small so generation stays under ~1s.
 */
function selectLocalChunks(message, limit) {
  const chunks = loadLocalChunks();
  const queryTokens = new Set(tokenize(message));
  if (!queryTokens.size) {
    return chunks.filter((c) => c.id === 'profile').slice(0, 1);
  }

  const scored = chunks.map((chunk) => {
    const haystack = [
      chunk.title,
      chunk.section,
      chunk.content,
      ...((chunk.metadata && chunk.metadata.keywords) || []),
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 1;
    }
    // Prefer core bio when scores tie.
    if (chunk.id === 'profile') score += 0.1;
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score >= 1).slice(0, limit);
  if (top.length) return top.map((s) => s.chunk);

  // Small talk / unrelated: only send a tiny profile stub so the model stays fast.
  return chunks.filter((c) => c.id === 'profile').slice(0, 1);
}

function chatConfig(systemInstruction) {
  const config = {
    systemInstruction,
    temperature: 0.6,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  };

  // Disable thinking on 2.5 Flash — dynamic thinking often adds multi-second latency.
  if (/gemini-2\.5-flash/i.test(CHAT_MODEL)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function embedQuery(text) {
  const result = await getAi().models.embedContent({
    model: EMBED_MODEL,
    contents: text,
  });

  const values = result?.embeddings?.[0]?.values || result?.embedding?.values;
  if (!values) {
    throw new Error('Gemini embedding response did not include vector values.');
  }
  return values;
}

async function retrieveChunks(queryEmbedding, matchCount, threshold) {
  const { data, error } = await getSupabase().rpc('match_rag_documents', {
    query_embedding: queryEmbedding,
    match_count: matchCount || 3,
    similarity_threshold: threshold || 0.45,
  });

  if (error) {
    throw new Error('Supabase RPC error: ' + error.message);
  }
  return data || [];
}

async function getPortfolioChunks(message) {
  if (!USE_VECTOR_SEARCH) {
    return selectLocalChunks(message, MAX_LOCAL_CHUNKS);
  }

  const queryEmbedding = await embedQuery(message);

  if (VECTOR_BACKEND === 'local') {
    const local = retrieveLocalVector(
      queryEmbedding,
      MAX_LOCAL_CHUNKS,
      VECTOR_THRESHOLD
    );
    if (local) return local;
    console.warn('[chat] portfolio-embeddings.json missing; falling back to keyword search.');
    return selectLocalChunks(message, MAX_LOCAL_CHUNKS);
  }

  return retrieveChunks(queryEmbedding, MAX_LOCAL_CHUNKS, VECTOR_THRESHOLD);
}

function buildSystemInstruction(chunks) {
  const context = chunks.length
    ? chunks.map((c, i) => '[' + (i + 1) + '] ' + c.title + '\n' + c.content).join('\n\n')
    : '(No portfolio sections matched this question.)';

  return (
    "You are Noman's AI on Naser Al Noman's portfolio. Be warm, witty, and concise. " +
    "Match the user's vibe. For facts about Noman, use PORTFOLIO CONTEXT only — do not invent. " +
    'If a detail is missing, say so briefly. Keep replies short (2-4 sentences) unless asked for detail. ' +
    'No emoji. Plain-text tone only (:3, :), ^^, heh). Never cite sources or titles.\n\n' +
    'PORTFOLIO CONTEXT:\n' +
    context
  );
}

function normalizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .slice(-HISTORY_TURNS)
    .map((entry) => {
      const role = entry && entry.role === 'model' ? 'model' : 'user';
      const text = String((entry && entry.text) || '').trim();
      if (!text) return null;
      return { role, parts: [{ text: text.slice(0, 800) }] };
    })
    .filter(Boolean);
}

async function generateAnswer(userMessage, chunks, history) {
  const systemInstruction = buildSystemInstruction(chunks);
  const contents = [
    ...normalizeHistory(history),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const response = await getAi().models.generateContent({
    model: CHAT_MODEL,
    contents,
    config: chatConfig(systemInstruction),
  });

  return stripEmojis(response.text);
}

/**
 * Full RAG chat pipeline. Safe to call from Vercel, local server, or Trigger.dev tasks.
 * @param {{ message: string, history?: Array<{ role?: string, text?: string }> }} input
 * @returns {Promise<{ answer: string, sources: string[], retrieved: string[] }>}
 */
async function runRagChat(input) {
  const message = String((input && input.message) || '').trim();
  const history = (input && input.history) || [];

  if (!message) {
    return {
      answer: "Hey! Ask me about Noman — or anything else on your mind.",
      sources: [],
      retrieved: [],
    };
  }

  try {
    const chunks = await getPortfolioChunks(message);
    const sources = chunks.map((c) => c.title);
    let answer;

    try {
      answer = await generateAnswer(message, chunks, history);
    } catch (generationErr) {
      if (isQuotaError(generationErr)) {
        console.warn('[chat] Gemini generation quota exceeded; trying Hugging Face fallback.');
        answer = await generateQuotaFallback({
          systemInstruction: buildSystemInstruction(chunks),
          userMessage: message,
          history,
          chunks,
        });
      } else {
        throw generationErr;
      }
    }

    return { answer, sources, retrieved: sources };
  } catch (err) {
    if (isQuotaError(err)) {
      const answer = await generateQuotaFallback({
        systemInstruction: buildSystemInstruction([]),
        userMessage: message,
        history,
        chunks: [],
      });
      return { answer, sources: [], retrieved: [] };
    }
    throw err;
  }
}

module.exports = {
  runRagChat,
  buildSystemInstruction,
  isQuotaError,
  warmupChat,
  warmupEmbed,
};
