'use strict';

// Verify ingestion — checks that all expected chunk IDs are present in Supabase.
// Usage: npm run ingest:verify

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('[verify] Missing env vars:', missing.join(', '));
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'portfolio-chunks.json');
  const { chunks } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const expectedIds = chunks.map((c) => c.id);

  const { data, error } = await supabase
    .from('rag_documents')
    .select('id, title, section')
    .in('id', expectedIds);

  if (error) {
    console.error('[verify] Supabase error:', error.message);
    process.exit(1);
  }

  const foundIds = new Set((data || []).map((r) => r.id));
  let allGood = true;

  for (const id of expectedIds) {
    const status = foundIds.has(id) ? '✓' : '✗ MISSING';
    console.log(`  ${status}  ${id}`);
    if (!foundIds.has(id)) allGood = false;
  }

  console.log('');
  console.log(
    allGood
      ? `[verify] All ${expectedIds.length} chunks are present in Supabase.`
      : `[verify] Some chunks are missing — re-run npm run ingest`
  );
  if (!allGood) process.exit(1);
}

main().catch((err) => {
  console.error('[verify] Fatal:', err);
  process.exit(1);
});
