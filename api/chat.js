'use strict';

const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const REQUIRED_ENV = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const envStatus = REQUIRED_ENV.reduce((status, name) => {
  status[name] = Boolean(process.env[name]);
  return status;
}, {});
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
console.log('[chat] Environment variable status:', envStatus);
if (missingEnv.length) {
  console.error('[chat] Missing required environment variables:', missingEnv.join(', '));
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
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

function buildDirectContextAnswer(chunks) {
  const summaries = chunks
    .slice(0, 2)
    .map((chunk) => chunk.title + ': ' + chunk.content)
    .join(' ');

  return (
    'Gemini is currently rate-limited, so I am sharing the closest portfolio details directly. ' +
    summaries
  );
}

async function embedQuery(text) {
  const result = await ai.models.embedContent({
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
  const { data, error } = await supabase.rpc('match_rag_documents', {
    query_embedding: queryEmbedding,
    match_count: matchCount || 5,
    similarity_threshold: threshold || 0.45,
  });

  if (error) {
    throw new Error('Supabase RPC error: ' + error.message);
  }
  return data || [];
}

async function generateAnswer(userMessage, chunks) {
  const context = chunks
    .map((c, i) => '[' + (i + 1) + '] ' + c.title + '\n' + c.content)
    .join('\n\n');

  const systemInstruction =
    "You are a helpful assistant for Naser Al Noman's portfolio website. " +
    'Answer questions ONLY using the provided context sections below. ' +
    'Be concise and conversational. ' +
    "If the answer is not present in the context, say: 'I don't have that information in the portfolio data — please reach out to Naser directly.' " +
    'Do NOT make up information.\n\nCONTEXT:\n' +
    context;

  const chat = ai.chats.create({ model: CHAT_MODEL, config: { systemInstruction } });
  const response = await chat.sendMessage({ message: userMessage });
  return response.text;
}

async function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').send('Method Not Allowed');
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON payload.' });
    return;
  }

  const message = (payload.message || '').trim();
  if (!message) {
    sendJson(res, 200, {
      answer: "Ask me anything about Naser's experience, skills, projects, education, or contact details.",
      sources: [],
      retrieved: [],
    });
    return;
  }

  try {
    const queryEmbedding = await embedQuery(message);
    const chunks = await retrieveChunks(queryEmbedding);

    if (!chunks.length) {
      sendJson(res, 200, {
        answer: "I don't have that information in the portfolio data — please reach out to Naser directly.",
        sources: [],
        retrieved: [],
      });
      return;
    }

    const sources = chunks.map((c) => c.title);
    let answer;

    try {
      answer = await generateAnswer(message, chunks);
    } catch (generationErr) {
      if (isQuotaError(generationErr)) {
        answer = buildDirectContextAnswer(chunks);
      } else {
        throw generationErr;
      }
    }

    sendJson(res, 200, { answer, sources, retrieved: sources });
  } catch (err) {
    if (isQuotaError(err)) {
      sendJson(res, 200, {
        answer:
          'Gemini quota is currently exhausted, so the assistant cannot generate a response right now. Please retry in about a minute or increase Gemini API quota.',
        sources: [],
        retrieved: [],
      });
      return;
    }

    console.error('[chat] RAG pipeline error:', err?.message || err);
    sendJson(res, 500, { error: 'Unable to process chat request. Please try again.' });
  }
};
