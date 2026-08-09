'use strict';

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { startChatJob, getChatJobStatus } = require('./lib/chat-jobs');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const RESUME_DIR = path.join(__dirname, 'resume');
const ACHIEVEMENTS_DIR = path.join(__dirname, 'achievements');
const MAX_BODY_SIZE = 1024 * 32; // 32 KB

const REQUIRED_ENV = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error('[server] Missing required environment variables:', missingEnv.join(', '));
  console.error('[server] Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(payload));
}

function handleChatPost(req, res) {
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
        answer: "Hey! Ask me about Noman — or anything else on your mind.",
        sources: [],
        retrieved: [],
      });
      return;
    }

    try {
      const result = await startChatJob({
        message,
        history: payload.history,
      });
      sendJson(res, 200, result);
    } catch (err) {
      console.error('[chat] Failed to start chat job:', err.message || err);
      sendJson(res, 500, { error: 'Unable to process chat request. Please try again.' });
    }
  });

  req.on('error', () => {
    sendJson(res, 500, { error: 'Unable to process chat request.' });
  });
}

async function handleChatStatus(req, res, runId) {
  try {
    const result = await getChatJobStatus(runId);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('[chat] Failed to retrieve chat job:', err.message || err);
    sendJson(res, 500, { status: 'FAILED', error: 'Unable to check chat status. Please try again.' });
  }
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
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && requestUrl.pathname === '/api/chat') {
    handleChatPost(req, res);
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/chat') {
    const runId = requestUrl.searchParams.get('runId');
    if (!runId) {
      sendJson(res, 400, { error: 'Missing runId query parameter.' });
      return;
    }
    handleChatStatus(req, res, runId);
    return;
  }

  if (requestUrl.pathname.startsWith('/resume/')) {
    const resumePath = requestUrl.pathname.slice('/resume/'.length);
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

  if (requestUrl.pathname.startsWith('/achievements/')) {
    const achievementPath = requestUrl.pathname.slice('/achievements/'.length);
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

  const urlPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  });
});

server.listen(PORT, () => {
  console.log(`Portfolio site running at http://localhost:${PORT}`);
});
