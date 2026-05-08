-- ============================================================
-- Naser Portfolio RAG Schema
-- Run this in the Supabase SQL Editor (once per project setup)
-- ============================================================

-- Enable pgvector extension (available on all Supabase projects)
CREATE EXTENSION IF NOT EXISTS vector;

-- -------------------------------------------------------
-- Table: rag_documents
-- Stores portfolio knowledge chunks + their embeddings
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_documents (
  id               TEXT        PRIMARY KEY,
  title            TEXT        NOT NULL,
  section          TEXT        NOT NULL,
  content          TEXT        NOT NULL,
  metadata         JSONB       DEFAULT '{}'::jsonb,
  embedding        vector(3072) NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Drop any legacy ANN index created for older 768-dim schema.
-- Must happen BEFORE ALTER COLUMN, otherwise Postgres rejects dimension change.
DROP INDEX IF EXISTS rag_documents_embedding_idx;
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'rag_documents'
      AND indexdef ILIKE '%USING ivfflat%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
  END LOOP;
END $$;

-- Migrate existing projects created with vector(768)
ALTER TABLE rag_documents
  ALTER COLUMN embedding TYPE vector(3072);

-- NOTE:
-- pgvector ivfflat indexes support up to 2000 dimensions for vector.
-- gemini-embedding-001 returns 3072 dimensions, so we intentionally skip
-- ANN indexing here and rely on exact cosine search.
-- With a small corpus (like this portfolio), this is fast and sufficient.

-- -------------------------------------------------------
-- Function: match_rag_documents
-- Returns chunks whose cosine similarity >= threshold,
-- ordered by similarity descending, limited to match_count
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS match_rag_documents(vector(768), int, float);
DROP FUNCTION IF EXISTS match_rag_documents(vector(3072), int, float);

CREATE OR REPLACE FUNCTION match_rag_documents(
  query_embedding      vector(3072),
  match_count          int     DEFAULT 5,
  similarity_threshold float   DEFAULT 0.5
)
RETURNS TABLE (
  id          TEXT,
  title       TEXT,
  section     TEXT,
  content     TEXT,
  metadata    JSONB,
  similarity  float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.section,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM rag_documents d
  WHERE 1 - (d.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
