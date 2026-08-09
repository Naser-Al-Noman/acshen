'use strict';

/**
 * Chat API helpers.
 * Default: sync RAG (snappy).
 * Set CHAT_VIA_TRIGGER=true + TRIGGER_SECRET_KEY to run chat on Trigger.dev.
 */

const { runRagChat } = require('./rag-chat');

let triggerConfigured = false;

function getTriggerSecretKey() {
  return String(process.env.TRIGGER_SECRET_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function isTriggerEnabled() {
  return Boolean(getTriggerSecretKey());
}

function shouldUseTriggerChat() {
  const flag = String(process.env.CHAT_VIA_TRIGGER || '')
    .trim()
    .toLowerCase();
  return isTriggerEnabled() && (flag === '1' || flag === 'true' || flag === 'yes');
}

function getTriggerSdk() {
  const sdk = require('@trigger.dev/sdk');

  if (!triggerConfigured) {
    if (typeof sdk.configure === 'function') {
      sdk.configure({
        secretKey: getTriggerSecretKey(),
      });
    }
    triggerConfigured = true;
  }

  return sdk;
}

async function startChatJob({ message, history }) {
  if (!shouldUseTriggerChat()) {
    const result = await runRagChat({ message, history });
    return { mode: 'sync', ...result };
  }

  try {
    const { tasks } = getTriggerSdk();
    const handle = await tasks.trigger('rag-chat', { message, history });
    return {
      mode: 'async',
      runId: handle.id,
      status: handle.status || 'QUEUED',
    };
  } catch (err) {
    console.error(
      '[chat] Trigger.dev trigger failed; falling back to sync RAG:',
      err?.message || err
    );
    const result = await runRagChat({ message, history });
    return { mode: 'sync', ...result };
  }
}

async function getChatJobStatus(runId) {
  if (!runId) {
    return { status: 'FAILED', error: 'Missing runId.' };
  }

  if (!isTriggerEnabled()) {
    return { status: 'FAILED', error: 'Trigger.dev is not configured.' };
  }

  try {
    const { runs } = getTriggerSdk();
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
  } catch (err) {
    console.error('[chat] Trigger.dev retrieve failed:', err?.message || err);
    return {
      status: 'FAILED',
      error: 'Unable to check chat status. Please try again.',
    };
  }
}

module.exports = {
  isTriggerEnabled,
  shouldUseTriggerChat,
  startChatJob,
  getChatJobStatus,
  runRagChat,
};
