'use strict';

// Builds data/portfolio-embeddings.json for fast local vector search (no Supabase at chat time).
// Usage: npm run build:embeddings

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';

if (!process.env.GEMINI_API_KEY) {
  console.error('[build-embeddings] Missing GEMINI_API_KEY');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function embedText(text) {
  const result = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: text,
  });
  const values = result?.embeddings?.[0]?.values || result?.embedding?.values;
  if (!values) throw new Error('Gemini embedding response did not include vector values.');
  return values;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'portfolio-chunks.json');
  const outPath = path.join(__dirname, '..', 'data', 'portfolio-embeddings.json');
  const { chunks } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log(`[build-embeddings] Embedding ${chunks.length} chunks with ${EMBED_MODEL}`);

  const embedded = [];
  for (const chunk of chunks) {
    process.stdout.write(`  → ${chunk.title} ... `);
    const embedding = await embedText(chunk.content);
    embedded.push({
      id: chunk.id,
      title: chunk.title,
      section: chunk.section,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding,
    });
    console.log(`OK (${embedding.length} dims)`);
    await sleep(1100);
  }

  const payload = {
    model: EMBED_MODEL,
    generatedAt: new Date().toISOString(),
    chunks: embedded,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`[build-embeddings] Wrote ${outPath}`);
}

main().catch((err) => {
  console.error('[build-embeddings] Fatal:', err.message || err);
  process.exit(1);
});
