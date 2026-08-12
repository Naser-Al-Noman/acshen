# Naser Al Noman

A modern, responsive portfolio website with a custom AI assistant. The chatbot uses Retrieval-Augmented Generation (RAG) with Google Gemini for portfolio questions and can also answer general questions. If Gemini hits quota limits, it falls back to Hugging Face Inference Providers.

Chat is tuned for low latency: **Gemini Flash-Lite**, local precomputed vector search (~1–1.5s), and sync responses by default. Optional [Trigger.dev](https://trigger.dev) support runs the pipeline as a background job to avoid Vercel serverless timeouts.

## Features

- **Modern UI/UX:** Clean, responsive design with dark/light mode toggle.
- **AI Chatbot:** Warm, conversational assistant for portfolio and general questions.
- **Fast RAG:** Semantic matching via precomputed embeddings in `data/portfolio-embeddings.json` (no Supabase round-trip at chat time).
- **Hugging Face fallback:** Optional backup model when Gemini is rate-limited, with timeout and local snippet fallback.
- **Chat UX:** Markdown-rendered replies, typing indicator, conversation history (last 4 turns), no source dumps.
- **Vanilla Frontend:** Fast HTML, CSS, and vanilla JavaScript.
- **Node.js Backend:** Local `server.js` and Vercel serverless `/api/chat`.
- **Optional Trigger.dev:** Background `rag-chat` task for timeout-safe production runs.
- **Dynamic Ingestion:** Scripts to update portfolio chunks and embeddings.

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js (`server.js` locally) / Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL with `pgvector`) — used for ingest; optional at chat runtime
- **Primary AI:** Google Gemini (`gemini-flash-lite-latest`, `gemini-embedding-001`)
- **Fallback AI:** Hugging Face Inference Providers (default: `Qwen/Qwen3-4B-Instruct-2507`)
- **Background jobs (optional):** Trigger.dev (`rag-chat` task)

## Local Development Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- A Google Gemini API key
- (Optional) A Supabase project — only needed for `npm run sync` / ingest
- (Optional) A Hugging Face token for quota fallback
- (Optional) A Trigger.dev project if you want background chat jobs

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env` and fill in the values:

```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_EMBED_MODEL=gemini-embedding-001
GEMINI_CHAT_MODEL=gemini-flash-lite-latest
GEMINI_MAX_OUTPUT_TOKENS=160
CHAT_HISTORY_TURNS=4

# Semantic search (default on)
CHAT_USE_VECTOR_SEARCH=true
CHAT_VECTOR_BACKEND=local
CHAT_MAX_LOCAL_CHUNKS=3

# Hugging Face (optional Gemini quota fallback)
HF_TOKEN=hf_your_token_here
HF_CHAT_MODEL=Qwen/Qwen3-4B-Instruct-2507
HF_MAX_TOKENS=160
HF_HISTORY_TURNS=4
HF_TIMEOUT_MS=1200
HF_SKIP_WHEN_CONTEXT=false

# Supabase (required for ingest only)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server
PORT=3000

# Trigger.dev (optional)
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=proj_replace_me
CHAT_VIA_TRIGGER=false
```

See [Environment variables reference](#environment-variables-reference) below for details.

### 4. Database Setup (ingest only)
Only needed if you run `npm run sync` to push chunks into Supabase:

1. Open the Supabase SQL Editor in your project dashboard.
2. Run the contents of `supabase/schema.sql` to create the `rag_documents` table and `match_rag_documents` function.

### 5. Portfolio data
1. Edit `data/portfolio-chunks.json` when resume content changes.
2. Rebuild local embeddings (required for semantic search):
```bash
npm run build:embeddings
```
3. Optionally sync to Supabase as well:
```bash
npm run sync
```
`npm run sync` runs ingest + verify + `build:embeddings`.

### 6. Run the Application
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000).

## How the Chatbot Works

1. The client sends the latest message plus the last 4 history entries to `POST /api/chat`.
2. **Retrieval (default):** embed the query with Gemini, then match against precomputed vectors in `data/portfolio-embeddings.json` (~1–1.5s, including first call).
3. **Generation:** Gemini Flash-Lite answers using that context when relevant, or general knowledge for other questions.
4. **Quota fallback:** if Gemini fails, try Hugging Face (1200ms timeout by default); if that fails, return a local portfolio snippet.
5. Replies are returned as markdown-friendly text; the UI renders bold/lists and strips emoji characters.

### Retrieval modes

| Mode | Env | Speed | Notes |
|------|-----|-------|-------|
| **Local vector** (default) | `CHAT_USE_VECTOR_SEARCH=true`, `CHAT_VECTOR_BACKEND=local` | ~1–1.5s | Uses `data/portfolio-embeddings.json`. No Supabase at runtime. |
| **Keyword only** | `CHAT_USE_VECTOR_SEARCH=false` | ~sub-1s | Local word matching on `portfolio-chunks.json`. |
| **Supabase RPC** | `CHAT_VECTOR_BACKEND=supabase` | ~1.5–3s | Live embed + `match_rag_documents`. Requires Supabase env vars. |

### Sync vs Trigger chat

| Mode | When | Behavior |
|------|------|----------|
| **Sync** (default) | `CHAT_VIA_TRIGGER` unset/`false` | One request waits for the full answer. Fastest UX. |
| **Trigger** | `CHAT_VIA_TRIGGER=true` and `TRIGGER_SECRET_KEY` set | API starts a `rag-chat` job; client polls `GET /api/chat?runId=...`. Avoids Vercel timeouts. |

Shared pipeline code lives in `lib/rag-chat.js` (used by local server, Vercel, and the Trigger task).

## Environment variables reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GEMINI_API_KEY` | Yes | — | Gemini chat + embeddings |
| `GEMINI_CHAT_MODEL` | No | `gemini-flash-lite-latest` | Chat model |
| `GEMINI_EMBED_MODEL` | No | `gemini-embedding-001` | Query embedding model |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | `160` | Max reply length |
| `CHAT_HISTORY_TURNS` | No | `4` | History messages sent to the model |
| `CHAT_USE_VECTOR_SEARCH` | No | `true` | Semantic search on/off |
| `CHAT_VECTOR_BACKEND` | No | `local` | `local` or `supabase` |
| `CHAT_MAX_LOCAL_CHUNKS` | No | `3` | Max chunks in prompt |
| `HF_TOKEN` | No | — | Hugging Face fallback |
| `HF_CHAT_MODEL` | No | `Qwen/Qwen3-4B-Instruct-2507` | Fallback model |
| `HF_TIMEOUT_MS` | No | `1200` | HF timeout before local snippet |
| `HF_SKIP_WHEN_CONTEXT` | No | `false` | `true` = skip HF when chunks exist |
| `SUPABASE_URL` | Ingest / supabase backend only | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingest / supabase backend only | — | Supabase service role |
| `CHAT_VIA_TRIGGER` | No | `false` | Run chat via Trigger.dev |
| `TRIGGER_SECRET_KEY` | Trigger only | — | Trigger API key |
| `TRIGGER_PROJECT_REF` | Trigger only | — | Trigger project ref |

## Useful scripts

```bash
npm start                # local server
npm run build:embeddings # rebuild data/portfolio-embeddings.json
npm run ingest           # push chunks to Supabase
npm run ingest:verify    # verify Supabase ingestion
npm run sync             # ingest + verify + build:embeddings
npm run trigger:dev      # local Trigger worker
npm run trigger:deploy   # deploy rag-chat to Trigger Production
```

## Trigger.dev (optional)

Use this when you want timeout protection on Vercel rather than maximum chat speed.

### Setup
1. Create a project at [cloud.trigger.dev](https://cloud.trigger.dev).
2. Set `TRIGGER_PROJECT_REF` in `.env` (and keep `trigger.config.ts` in sync).
3. Set `TRIGGER_SECRET_KEY`:
   - Local / `trigger:dev` → Development key (`tr_dev_...`)
   - Vercel Production → Production key (`tr_prod_...`)
4. In the Trigger dashboard **Environment variables**, add the same Gemini / HF keys (and Supabase if using supabase backend) for **Development** and **Production**.
5. Deploy the task:
```bash
npm run trigger:deploy
```

### Local Trigger worker
With `CHAT_VIA_TRIGGER=true` locally:
```bash
npm run trigger:dev
```
Keep that running alongside `npm start`.

## Deployment (Vercel)

1. Push the repo to GitHub (include `data/portfolio-embeddings.json`).
2. Import the project in Vercel.
3. Add environment variables:

**Required for chat**
| Variable | Value |
|----------|-------|
| `GEMINI_API_KEY` | your Gemini API key |

**Recommended**
| Variable | Value |
|----------|-------|
| `GEMINI_CHAT_MODEL` | `gemini-flash-lite-latest` |
| `GEMINI_MAX_OUTPUT_TOKENS` | `160` |
| `CHAT_HISTORY_TURNS` | `4` |
| `CHAT_USE_VECTOR_SEARCH` | `true` (or omit — same default) |
| `CHAT_VECTOR_BACKEND` | `local` (or omit) |
| `CHAT_VIA_TRIGGER` | `false` |

**Optional fallback**
| Variable | Value |
|----------|-------|
| `HF_TOKEN` | your Hugging Face token |
| `HF_CHAT_MODEL` | `Qwen/Qwen3-4B-Instruct-2507` |
| `HF_TIMEOUT_MS` | `1200` |
| `HF_SKIP_WHEN_CONTEXT` | `false` |

**Supabase** — only if you use `CHAT_VECTOR_BACKEND=supabase` or run ingest from CI:
| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | your Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |

**Trigger.dev** — only if `CHAT_VIA_TRIGGER=true`:
| Variable | Value |
|----------|-------|
| `TRIGGER_SECRET_KEY` | `tr_prod_...` |
| `TRIGGER_PROJECT_REF` | your project ref |
| `CHAT_VIA_TRIGGER` | `true` |

4. Redeploy after changing env vars.
5. If using Trigger chat, run `npm run trigger:deploy` and mirror env vars in the Trigger dashboard.

**Recommendation:** leave `CHAT_VIA_TRIGGER=false` for snappy chat. Set it to `true` only if you hit Vercel timeouts.

## License

This project is licensed under the [MIT License](LICENSE).
