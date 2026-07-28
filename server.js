'use strict';

require('dotenv').config();

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { GoogleGenAI }  = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT         = process.env.PORT || 3000;
const PUBLIC_DIR         = path.join(__dirname, 'public');
const RESUME_DIR         = path.join(__dirname, 'resume');
const ACHIEVEMENTS_DIR   = path.join(__dirname, 'achievements');
const MAX_BODY_SIZE      = 1024 * 32; // 32 KB

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv   = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error('[server] Missing required environment variables:', missingEnv.join(', '));
  console.error('[server] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const CHAT_MODEL  = process.env.GEMINI_CHAT_MODEL  || 'gemini-2.5-flash';

// ── Clients ───────────────────────────────────────────────────────────────────
const ai       = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html' : 'text/html; charset=UTF-8',
  '.css'  : 'text/css; charset=UTF-8',
  '.js'   : 'application/javascript; charset=UTF-8',
  '.json' : 'application/json; charset=UTF-8',
  '.svg'  : 'image/svg+xml',
  '.png'  : 'image/png',
  '.jpg'  : 'image/jpeg',
  '.jpeg' : 'image/jpeg',
  '.webp' : 'image/webp',
  '.ico'  : 'image/x-icon',
  '.pdf'  : 'application/pdf',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
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

// ── RAG pipeline ──────────────────────────────────────────────────────────────
async function embedQuery(text) {
  const result = await ai.models.embedContent({
    model   : EMBED_MODEL,
    contents: text,
  });
  const values = result?.embeddings?.[0]?.values || result?.embedding?.values;
  if (!values) throw new Error('Gemini embedding response did not include vector values.');
  return values;
}

async function retrieveChunks(queryEmbedding, matchCount, threshold) {
  const { data, error } = await supabase.rpc('match_rag_documents', {
    query_embedding     : queryEmbedding,
    match_count         : matchCount || 5,
    similarity_threshold: threshold  || 0.45,
  });
  if (error) throw new Error('Supabase RPC error: ' + error.message);
  return data || [];
}

function buildSystemInstruction(chunks) {
  const context = chunks.length
    ? chunks.map((c, i) => '[' + (i + 1) + '] ' + c.title + '\n' + c.content).join('\n\n')
    : '(No portfolio sections matched this question.)';

  return (
    "You are a smart, friendly assistant on Naser Al Noman's portfolio website. " +
    "You can answer both portfolio questions and general knowledge questions. " +
    "When the user asks about Naser (experience, skills, projects, education, contact, awards), " +
    "prefer the portfolio CONTEXT below and do not invent personal facts about him. " +
    "If a personal detail about Naser is missing from CONTEXT, say you do not have that detail and suggest contacting him. " +
    "For general, technical, career, or random questions unrelated to Naser's bio, answer helpfully using your knowledge. " +
    "Be clear, accurate, and conversational. Use short paragraphs or markdown bullets when useful. " +
    "Do not list sources, citations, or document titles in your reply. " +
    "Stay professional and avoid fabricating citations.\n\n" +
    "PORTFOLIO CONTEXT:\n" +
    context
  );
}

function normalizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .slice(-8)
    .map((entry) => {
      const role = entry && entry.role === 'model' ? 'model' : 'user';
      const text = String((entry && entry.text) || '').trim();
      if (!text) return null;
      return { role, parts: [{ text: text.slice(0, 2000) }] };
    })
    .filter(Boolean);
}

async function generateAnswer(userMessage, chunks, history) {
  const systemInstruction = buildSystemInstruction(chunks);
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    config: {
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
    history: normalizeHistory(history),
  });
  const response = await chat.sendMessage({ message: userMessage });
  return response.text;
}

// ── Chat request handler ──────────────────────────────────────────────────────
function handleChatRequest(req, res) {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_SIZE) req.destroy();
  });

  req.on('end', async () => {
    let payload;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload.' });
      return;
    }

    const message = (payload.message || '').trim();
    if (!message) {
      sendJson(res, 200, {
        answer   : "Ask me about Noman's experience, skills, and projects — or any other question you'd like help with.",
        sources  : [],
        retrieved: [],
      });
      return;
    }

    try {
      const queryEmbedding = await embedQuery(message);
      const chunks         = await retrieveChunks(queryEmbedding);
      const sources        = chunks.map((c) => c.title);
      let answer;

      try {
        answer = await generateAnswer(message, chunks, payload.history);
      } catch (generationErr) {
        if (isQuotaError(generationErr)) {
          console.warn('[chat] Gemini generation quota exceeded; using direct-context fallback.');
          answer = chunks.length
            ? buildDirectContextAnswer(chunks)
            : 'Gemini quota is currently exhausted, so the assistant cannot generate a response right now. Please retry in about a minute.';
        } else {
          throw generationErr;
        }
      }

      sendJson(res, 200, { answer, sources, retrieved: sources });
    } catch (err) {
      console.error('[chat] RAG pipeline error:', err.message);
      if (isQuotaError(err)) {
        sendJson(res, 200, {
          answer:
            'Gemini quota is currently exhausted, so the assistant cannot generate a response right now. Please retry in about a minute or increase Gemini API quota.',
          sources: [],
          retrieved: [],
        });
        return;
      }
      sendJson(res, 500, { error: 'Unable to process chat request. Please try again.' });
    }
  });

  req.on('error', () => {
    sendJson(res, 500, { error: 'Unable to process chat request.' });
  });
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChatRequest(req, res);
    return;
  }

  if (req.url?.startsWith('/resume/')) {
    const resumePath = req.url.slice('/resume/'.length);
    const safePath = path.normalize(resumePath).replace(/^([.][.][/\\])+/, '');
    const filePath = path.join(RESUME_DIR, safePath);

    if (!filePath.startsWith(RESUME_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        sendFile(res, filePath);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
    });
    return;
  }

  if (req.url?.startsWith('/achievements/')) {
    const achievementPath = req.url.slice('/achievements/'.length);
    const safePath = path.normalize(achievementPath).replace(/^([.][.][/\\])+/, '');
    const filePath = path.join(ACHIEVEMENTS_DIR, safePath);

    if (!filePath.startsWith(ACHIEVEMENTS_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        sendFile(res, filePath);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
    });
    return;
  }

  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8" });
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    sendFile(res, path.join(PUBLIC_DIR, "index.html"));
  });
});

server.listen(PORT, () => {
  console.log(`Portfolio site running at http://localhost:${PORT}`);
});
