# Naser Al Noman 

A modern, responsive portfolio website featuring a custom-built AI Assistant. The chatbot is powered by Retrieval-Augmented Generation (RAG) using Google Gemini and Supabase to answer questions directly based on my resume, experience, and skills.

## Features

- **Modern UI/UX:** Clean, responsive design with dark/light mode toggle.
- **AI Chatbot (RAG):** Context-aware chatbot powered by Gemini 2.5 Flash and `pgvector`.
- **Vanilla Frontend:** Fast and lightweight using HTML, CSS, and vanilla JavaScript.
- **Node.js Backend:** Handles API requests securely to communicate with Gemini and Supabase.
- **Dynamic Ingestion:** Easy-to-use scripts to update portfolio data in the vector database.

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js, Express (via `server.js` locally) / Vercel Serverless Functions
- **Database:** Supabase (PostgreSQL with `pgvector` extension)
- **AI & Embeddings:** Google Gemini API (`gemini-2.5-flash` & `gemini-embedding-001`)

## Local Development Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- A Supabase Project
- A Google Gemini API Key

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add the following keys:
```env
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Database Setup
1. Open the Supabase SQL Editor in your project dashboard.
2. Copy the contents of `supabase/schema.sql` and run it to create the `rag_documents` table and `match_rag_documents` function.

### 5. Data Ingestion
To populate the chatbot's knowledge base with your portfolio data:
1. Edit `data/portfolio-chunks.json` if needed.
2. Run the ingestion and verification script:
```bash
npm run sync
```

### 6. Run the Application
Start the local development server:
```bash
npm start
```
The portfolio will be running at `http://localhost:3000`.

## Deployment
This project is configured to be easily deployed on **Vercel**. 
1. Push your code to GitHub.
2. Import the repository into Vercel.
3. Add the required environment variables in the Vercel Dashboard.
4. Deploy!

## License
This project is licensed under the [MIT License](LICENSE).
