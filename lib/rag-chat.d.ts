export function runRagChat(input: {
  message: string;
  history?: Array<{ role?: string; text?: string }>;
}): Promise<{
  answer: string;
  sources: string[];
  retrieved: string[];
}>;

export function buildSystemInstruction(
  chunks: Array<{ title: string; content: string }>
): string;

export function isQuotaError(err: unknown): boolean;
