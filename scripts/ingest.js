'use strict';

// Ingestion script — embeds portfolio chunks with Gemini and upserts into Supabase.
// Usage: npm run ingest
// Prerequisites: fill .env with GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Validate environment ──────────────────────────────────────────────────────
const required = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[ingest] Missing env vars:', missing.join(', '));
  process.exit(1);
}

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';

// ── Clients ───────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'portfolio-chunks.json');
  const { chunks } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log(`[ingest] Loaded ${chunks.length} chunks from portfolio-chunks.json`);
  console.log(`[ingest] Using embedding model: ${EMBED_MODEL}`);

  let successCount = 0;
  let errorCount = 0;

  for (const chunk of chunks) {
    process.stdout.write(`  → Embedding "${chunk.title}" ... `);
    try {
      const embedding = await embedText(chunk.content);

      const { error } = await supabase.from('rag_documents').upsert(
        {
          id: chunk.id,
          title: chunk.title,
          section: chunk.section,
          content: chunk.content,
          metadata: chunk.metadata,
          embedding,
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.log('FAILED');
        console.error(`     Supabase error: ${error.message}`);
        errorCount++;
      } else {
        console.log(`OK  (${embedding.length} dims)`);
        successCount++;
      }
    } catch (err) {
      console.log('ERROR');
      console.error(`     ${err.message}`);
      errorCount++;
    }

    // Respect Gemini API rate limits (1 req/s on free tier)
    await sleep(1100);
  }

  console.log('');
  console.log(`[ingest] Done. ${successCount} upserted, ${errorCount} failed.`);
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
