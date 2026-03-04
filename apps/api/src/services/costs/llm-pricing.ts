/**
 * LLM token pricing table.
 *
 * Embedded per-model pricing for all major LLM providers.
 * Prices are in USD per million tokens.
 *
 * Source: https://github.com/Portkey-AI/models (community-maintained, 1600+ models)
 * Last synced: 2026-03-03
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LlmModelPricing {
  provider: string;
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing table — keyed by "provider/model" for exact match, then prefix match
// ─────────────────────────────────────────────────────────────────────────────

const PRICING_TABLE: LlmModelPricing[] = [
  // ── Anthropic ────────────────────────────────────────────────────────────
  {
    provider: "anthropic",
    model: "claude-opus-4",
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4",
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4",
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-sonnet",
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  {
    provider: "anthropic",
    model: "claude-3-5-haiku",
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1,
  },
  {
    provider: "anthropic",
    model: "claude-3-opus",
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },
  { provider: "anthropic", model: "claude-3-sonnet", inputPerMillion: 3, outputPerMillion: 15 },
  { provider: "anthropic", model: "claude-3-haiku", inputPerMillion: 0.25, outputPerMillion: 1.25 },

  // ── OpenAI ───────────────────────────────────────────────────────────────
  { provider: "openai", model: "gpt-4o", inputPerMillion: 2.5, outputPerMillion: 10 },
  { provider: "openai", model: "gpt-4o-mini", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { provider: "openai", model: "gpt-4-turbo", inputPerMillion: 10, outputPerMillion: 30 },
  { provider: "openai", model: "gpt-4", inputPerMillion: 30, outputPerMillion: 60 },
  { provider: "openai", model: "gpt-3.5-turbo", inputPerMillion: 0.5, outputPerMillion: 1.5 },
  { provider: "openai", model: "o1", inputPerMillion: 15, outputPerMillion: 60 },
  { provider: "openai", model: "o1-mini", inputPerMillion: 3, outputPerMillion: 12 },
  { provider: "openai", model: "o3", inputPerMillion: 10, outputPerMillion: 40 },
  { provider: "openai", model: "o3-mini", inputPerMillion: 1.1, outputPerMillion: 4.4 },
  { provider: "openai", model: "o4-mini", inputPerMillion: 1.1, outputPerMillion: 4.4 },
  { provider: "openai", model: "codex-mini", inputPerMillion: 1.5, outputPerMillion: 6 },

  // ── Google Gemini ────────────────────────────────────────────────────────
  { provider: "google", model: "gemini-2.5-pro", inputPerMillion: 1.25, outputPerMillion: 10 },
  { provider: "google", model: "gemini-2.5-flash", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { provider: "google", model: "gemini-2.0-flash", inputPerMillion: 0.1, outputPerMillion: 0.4 },
  { provider: "google", model: "gemini-1.5-pro", inputPerMillion: 1.25, outputPerMillion: 5 },
  { provider: "google", model: "gemini-1.5-flash", inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // ── Groq ─────────────────────────────────────────────────────────────────
  { provider: "groq", model: "llama-3.3-70b", inputPerMillion: 0.59, outputPerMillion: 0.79 },
  { provider: "groq", model: "llama-3.1-8b", inputPerMillion: 0.05, outputPerMillion: 0.08 },
  { provider: "groq", model: "llama-3.1-70b", inputPerMillion: 0.59, outputPerMillion: 0.79 },
  { provider: "groq", model: "mixtral-8x7b", inputPerMillion: 0.24, outputPerMillion: 0.24 },
  { provider: "groq", model: "gemma2-9b", inputPerMillion: 0.2, outputPerMillion: 0.2 },

  // ── Mistral ──────────────────────────────────────────────────────────────
  { provider: "mistral", model: "mistral-large", inputPerMillion: 2, outputPerMillion: 6 },
  { provider: "mistral", model: "mistral-medium", inputPerMillion: 2.7, outputPerMillion: 8.1 },
  { provider: "mistral", model: "mistral-small", inputPerMillion: 0.2, outputPerMillion: 0.6 },
  { provider: "mistral", model: "codestral", inputPerMillion: 0.3, outputPerMillion: 0.9 },

  // ── xAI (Grok) ──────────────────────────────────────────────────────────
  { provider: "xai", model: "grok-3", inputPerMillion: 3, outputPerMillion: 15 },
  { provider: "xai", model: "grok-3-mini", inputPerMillion: 0.3, outputPerMillion: 0.5 },
  { provider: "xai", model: "grok-2", inputPerMillion: 2, outputPerMillion: 10 },

  // ── Cohere ───────────────────────────────────────────────────────────────
  { provider: "cohere", model: "command-r-plus", inputPerMillion: 2.5, outputPerMillion: 10 },
  { provider: "cohere", model: "command-r", inputPerMillion: 0.15, outputPerMillion: 0.6 },
  { provider: "cohere", model: "command-light", inputPerMillion: 0.3, outputPerMillion: 0.6 },

  // ── AWS Bedrock (pass-through — same pricing as native) ──────────────────
  {
    provider: "bedrock",
    model: "anthropic.claude-3-5-sonnet",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    provider: "bedrock",
    model: "anthropic.claude-3-haiku",
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
  },
  {
    provider: "bedrock",
    model: "amazon.titan-text-premier",
    inputPerMillion: 0.5,
    outputPerMillion: 1.5,
  },

  // ── Together AI ──────────────────────────────────────────────────────────
  {
    provider: "together",
    model: "meta-llama/Llama-3.3-70B",
    inputPerMillion: 0.88,
    outputPerMillion: 0.88,
  },
  {
    provider: "together",
    model: "meta-llama/Llama-3.1-8B",
    inputPerMillion: 0.18,
    outputPerMillion: 0.18,
  },

  // ── Ollama (local) — $0 by default ──────────────────────────────────────
  { provider: "ollama", model: "*", inputPerMillion: 0, outputPerMillion: 0 },
];

// Build lookup index: exact "provider/model" → pricing
const exactIndex = new Map<string, LlmModelPricing>();
const prefixEntries: LlmModelPricing[] = [];

for (const entry of PRICING_TABLE) {
  if (entry.model === "*") {
    prefixEntries.push(entry);
  } else {
    exactIndex.set(`${entry.provider}/${entry.model}`, entry);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find pricing for a provider/model pair.
 * Tries exact match first, then prefix match (model starts with table entry),
 * then wildcard provider match.
 */
export function findLlmPricing(provider: string, model: string): LlmModelPricing | null {
  const normProvider = provider.toLowerCase();
  const normModel = model.toLowerCase();
  const key = `${normProvider}/${normModel}`;

  // Exact match
  if (exactIndex.has(key)) return exactIndex.get(key)!;

  // Prefix match: find longest matching model prefix for this provider
  let bestMatch: LlmModelPricing | null = null;
  let bestLen = 0;
  for (const [k, v] of exactIndex) {
    if (
      k.startsWith(`${normProvider}/`) &&
      normModel.startsWith(v.model) &&
      v.model.length > bestLen
    ) {
      bestMatch = v;
      bestLen = v.model.length;
    }
  }
  if (bestMatch) return bestMatch;

  // Wildcard provider match (e.g., ollama/*)
  for (const entry of prefixEntries) {
    if (entry.provider === normProvider) return entry;
  }

  return null;
}

/**
 * Compute the USD cost for a single LLM API call.
 */
export function computeLlmCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const pricing = findLlmPricing(provider, model);
  if (!pricing) return 0;

  let cost = 0;
  cost += (inputTokens / 1_000_000) * pricing.inputPerMillion;
  cost += (outputTokens / 1_000_000) * pricing.outputPerMillion;
  if (cacheReadTokens > 0 && pricing.cacheReadPerMillion) {
    cost += (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
  }
  if (cacheWriteTokens > 0 && pricing.cacheWritePerMillion) {
    cost += (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
  }

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal precision
}

/**
 * Get the full pricing table (for admin display or Draupnir sync).
 */
export function getLlmPricingTable(): LlmModelPricing[] {
  return PRICING_TABLE;
}
