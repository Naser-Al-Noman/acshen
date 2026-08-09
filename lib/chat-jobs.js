'use strict';

/**
 * Chat API helpers: sync RAG locally, or Trigger.dev when TRIGGER_SECRET_KEY is set.
 */

const { runRagChat } = require('./rag-chat');

function isTriggerEnabled() {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

async function startChatJob({ message, history }) {
  if (!isTriggerEnabled()) {
    const result = await runRagChat({ message, history });
    return { mode: 'sync', ...result };
  }

  const { tasks } = await import('@trigger.dev/sdk');
  const handle = await tasks.trigger('rag-chat', { message, history });
  return {
    mode: 'async',
    runId: handle.id,
    status: handle.status || 'QUEUED',
  };
}

async function getChatJobStatus(runId) {
  if (!runId) {
    return { status: 'FAILED', error: 'Missing runId.' };
  }

  if (!isTriggerEnabled()) {
    return { status: 'FAILED', error: 'Trigger.dev is not configured.' };
  }

  const { runs } = await import('@trigger.dev/sdk');
  const run = await runs.retrieve(runId);

  if (run.isCompleted && run.isSuccess) {
    const output = run.output || {};
    return {
      status: 'COMPLETED',
      answer: output.answer || '',
      sources: output.sources || [],
      retrieved: output.retrieved || output.sources || [],
    };
  }

  if (run.isFailed || run.isCancelled || run.isExpired || run.isSystemFailure) {
    return {
      status: 'FAILED',
      error: 'Unable to process chat request. Please try again.',
    };
  }

  return {
    status: run.status || 'PENDING',
  };
}

module.exports = {
  isTriggerEnabled,
  startChatJob,
  getChatJobStatus,
  runRagChat,
};
