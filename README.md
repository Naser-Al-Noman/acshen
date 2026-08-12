# Naser Al Noman

A modern, responsive portfolio website with a custom AI assistant. The chatbot uses Retrieval-Augmented Generation (RAG) with Google Gemini and Supabase for portfolio questions, and can also answer general questions. If Gemini hits quota limits, it falls back to Hugging Face Inference Providers.

Optional [Trigger.dev](https://trigger.dev) support runs the RAG pipeline as a background job to avoid Vercel serverless timeouts. Chat defaults to a faster **sync** path; Trigger is opt-in.

## Features

- **Modern UI/UX:** Clean, responsive design with dark/light mode toggle.
- **AI Chatbot:** Warm, conversational assistant for portfolio and general questions.
- **RAG for portfolio facts:** Gemini + Supabase `pgvector` retrieves resume/experience context when relevant.
- **Hugging Face fallback:** Optional backup model when Gemini is rate-limited.
- **Chat UX:** Markdown-rendered replies, typing indicator, conversation history, no source dumps.
- **Vanilla Frontend:** Fast HTML, CSS, and vanilla JavaScript.
- **Node.js Backend:** Local `server.js` and Vercel serverless `/api/chat`.
- **Optional Trigger.dev:** Background `rag-chat` task for timeout-safe production runs.
- **Dynamic Ingestion:** Scripts to update portfolio chunks in the vector database.

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js (`server.js` locally) / Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL with `pgvector`)
- **Primary AI:** Google Gemini (`gemini-flash-lite-latest`; optional embed + Supabase vector search)
- **Fallback AI:** Hugging Face Inference Providers (default: `Qwen/Qwen3-4B-Instruct-2507`)
- **Background jobs (optional):** Trigger.dev (`rag-chat` task)

## Local Development Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- A Supabase project
- A Google Gemini API key
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
CHAT_USE_VECTOR_SEARCH=true
# CHAT_USE_VECTOR_SEARCH=false

# Hugging Face (optional Gemini quota fallback)
HF_TOKEN=hf_your_token_here
HF_CHAT_MODEL=Qwen/Qwen3-4B-Instruct-2507

# Supabase (required for ingest / optional vector search)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server
PORT=3000

# Trigger.dev (optional)
TRIGGER_SECRET_KEY=
TRIGGER_PROJECT_REF=proj_replace_me
# false/unset = sync chat (snappy); true = run chat via Trigger
CHAT_VIA_TRIGGER=false
```

`HF_TOKEN` is optional. Without it, Gemini quota failures fall back to a short raw-context summary instead of another LLM.

Chat uses semantic matching by default via `data/portfolio-embeddings.json` (~1–1.5s). Set `CHAT_USE_VECTOR_SEARCH=false` for faster keyword-only matching (~sub-1s). Run `npm run build:embeddings` after editing portfolio chunks. Set `CHAT_VECTOR_BACKEND=supabase` only for legacy Supabase RPC retrieval.

### 4. Database Setup
1. Open the Supabase SQL Editor in your project dashboard.
2. Run the contents of `supabase/schema.sql` to create the `rag_documents` table and `match_rag_documents` function.

### 5. Data Ingestion
To populate the chatbot knowledge base:
1. Edit `data/portfolio-chunks.json` if needed.
2. Run:
```bash
npm run sync
```

### 6. Run the Application
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000).

## How the Chatbot Works

1. The client sends the latest message plus recent chat history to `POST /api/chat`.
2. By default the server embeds the query and matches against precomputed vectors in `data/portfolio-embeddings.json` (~1–1.5s). Set `CHAT_USE_VECTOR_SEARCH=false` for keyword-only matching. Use `CHAT_VECTOR_BACKEND=supabase` only if you want live DB retrieval instead.
3. Gemini Flash-Lite answers using that context when relevant, or general knowledge for other questions.
4. If Gemini hits quota/rate limits, the server tries Hugging Face first (short timeout); if that fails or times out, it falls back to a local portfolio snippet when context is available. Set `HF_SKIP_WHEN_CONTEXT=true` to skip HF and use local context immediately.
5. Replies are returned as markdown-friendly text; the UI renders bold/lists and strips emoji characters.

### Sync vs Trigger chat

| Mode | When | Behavior |
|------|------|----------|
| **Sync** (default) | `CHAT_VIA_TRIGGER` unset/`false` | One request waits for the full RAG answer. Fastest UX. |
| **Trigger** | `CHAT_VIA_TRIGGER=true` and `TRIGGER_SECRET_KEY` set | API starts a `rag-chat` job, client polls `GET /api/chat?runId=...` until complete. Avoids Vercel timeouts on slow LLM calls. |

Shared pipeline code lives in `lib/rag-chat.js` (used by local server, Vercel, and the Trigger task).

## Trigger.dev (optional)

Use this when you want timeout protection on Vercel rather than maximum chat speed.

### Setup
1. Create a project at [cloud.trigger.dev](https://cloud.trigger.dev).
2. Set `TRIGGER_PROJECT_REF` in `.env` (and keep `trigger.config.ts` in sync).
3. Set `TRIGGER_SECRET_KEY`:
   - Local / `trigger:dev` → Development key (`tr_dev_...`)
   - Vercel Production → Production key (`tr_prod_...`)
4. In the Trigger dashboard **Environment variables**, add the same Gemini / Supabase / HF keys for **Development** and **Production**.
5. Deploy the task:
```bash
npm run trigger:deploy
```

### Local Trigger worker
With `CHAT_VIA_TRIGGER=true` locally:
```bash
npm run trigger:dev
```
Keep that running alongside `npm start` / `npm run dev`.

### Useful scripts
```bash
npm run trigger:dev      # local Trigger worker
npm run trigger:deploy   # deploy rag-chat to Trigger Production
```

## Deployment

Configured for **Vercel**:

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add environment variables:
   - Required: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Optional: `HF_TOKEN`, `HF_CHAT_MODEL`, Gemini model overrides
   - Optional Trigger: `TRIGGER_SECRET_KEY` (`tr_prod_...`), `TRIGGER_PROJECT_REF`, `CHAT_VIA_TRIGGER`
4. If using Trigger chat, run `npm run trigger:deploy` and ensure Production env vars exist in the Trigger dashboard.
5. Deploy / redeploy on Vercel after changing env vars.

Default recommendation: leave `CHAT_VIA_TRIGGER` unset or `false` for snappy chat. Set it to `true` if you start hitting Vercel timeouts.

## License

This project is licensed under the [MIT License](LICENSE).
