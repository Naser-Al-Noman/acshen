import { task } from "@trigger.dev/sdk";
import { runRagChat } from "../lib/rag-chat.js";

export type RagChatPayload = {
  message: string;
  history?: Array<{ role?: string; text?: string }>;
};

export type RagChatResult = {
  answer: string;
  sources: string[];
  retrieved: string[];
};

/**
 * Runs the portfolio RAG chat pipeline outside Vercel so Gemini/HF latency
 * cannot hit serverless timeouts.
 */
export const ragChatTask = task({
  id: "rag-chat",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: RagChatPayload): Promise<RagChatResult> => {
    return runRagChat({
      message: payload.message,
      history: payload.history,
    });
  },
});
