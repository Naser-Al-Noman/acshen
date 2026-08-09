'use strict';

const { startChatJob, getChatJobStatus } = require('../lib/chat-jobs');

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

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
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

async function handlePost(req, res) {
  let payload;
  try {
    if (req.body) {
      payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      payload = await parseRequestBody(req);
    }
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
    console.error('[chat] Failed to start chat job:', err?.message || err);
    sendJson(res, 500, { error: 'Unable to process chat request. Please try again.' });
  }
}

async function handleGet(req, res) {
  const runId =
    (req.query && req.query.runId) ||
    (typeof req.url === 'string'
      ? new URL(req.url, 'http://localhost').searchParams.get('runId')
      : null);

  if (!runId) {
    sendJson(res, 400, { error: 'Missing runId query parameter.' });
    return;
  }

  try {
    const result = await getChatJobStatus(runId);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('[chat] Failed to retrieve chat job:', err?.message || err);
    sendJson(res, 500, { status: 'FAILED', error: 'Unable to check chat status. Please try again.' });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    await handleGet(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'GET, POST').send('Method Not Allowed');
    return;
  }

  await handlePost(req, res);
};
