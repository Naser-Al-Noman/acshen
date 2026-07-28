# Naser Al Noman

A modern, responsive portfolio website with a custom AI assistant. The chatbot uses Retrieval-Augmented Generation (RAG) with Google Gemini and Supabase for portfolio questions, and can also answer general questions. If Gemini hits quota limits, it falls back to Hugging Face Inference Providers.

## Features

- **Modern UI/UX:** Clean, responsive design with dark/light mode toggle.
- **AI Chatbot:** Warm, conversational assistant for portfolio and general questions.
- **RAG for portfolio facts:** Gemini + Supabase `pgvector` retrieves resume/experience context when relevant.
- **Hugging Face fallback:** Optional backup model when Gemini is rate-limited.
- **Chat UX:** Markdown-rendered replies, typing indicator, conversation history, no source dumps.
- **Vanilla Frontend:** Fast HTML, CSS, and vanilla JavaScript.
- **Node.js Backend:** Local `server.js` and Vercel serverless `/api/chat`.
- **Dynamic Ingestion:** Scripts to update portfolio chunks in the vector database.

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js (`server.js` locally) / Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL with `pgvector`)
- **Primary AI:** Google Gemini (`gemini-2.5-flash`, `gemini-embedding-001`)
- **Fallback AI:** Hugging Face Inference Providers (default: `Qwen/Qwen3-4B-Instruct-2507`)

## Local Development Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- A Supabase project
- A Google Gemini API key
- (Optional) A Hugging Face token for quota fallback

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
GEMINI_CHAT_MODEL=gemini-2.5-flash

# Hugging Face (optional Gemini quota fallback)
# Create a free token at https://huggingface.co/settings/tokens
# Enable "Make calls to Inference Providers" if prompted
HF_TOKEN=hf_your_token_here
HF_CHAT_MODEL=Qwen/Qwen3-4B-Instruct-2507

# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server
PORT=3000
```

`HF_TOKEN` is optional. Without it, Gemini quota failures fall back to a short raw-context summary instead of another LLM.

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
2. The query is embedded with Gemini and matched against portfolio chunks in Supabase.
3. Gemini answers using portfolio context when relevant, or general knowledge for other questions.
4. If Gemini hits quota/rate limits, the server tries Hugging Face with the same system prompt and context.
5. Replies are returned as markdown-friendly text; the UI renders bold/lists and strips emoji characters.

## Deployment

Configured for **Vercel**:

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add the same environment variables (including optional `HF_TOKEN` / `HF_CHAT_MODEL`).
4. Deploy.

## License

This project is licensed under the [MIT License](LICENSE).
