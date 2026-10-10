import { AIProvider, AIContext, AIClassification, SpamCategory } from "../types";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class OpenRouterAI implements AIProvider {
  private apiKey: string;
  private model: string;
  private cache = new Map<string, { result: AIClassification; expiresAt: number }>();
  private guildLimits = new Map<string, RateLimitEntry>();
  private userLimits = new Map<string, RateLimitEntry>();
  private maxGuildRequests: number;
  private maxUserRequests: number;
  private cacheTtlMs = 60_000;

  constructor(
    apiKey: string,
    model: string,
    maxGuildRequests: number = 10,
    maxUserRequests: number = 2
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxGuildRequests = maxGuildRequests;
    this.maxUserRequests = maxUserRequests;
  }

  private getCacheKey(context: AIContext): string {
    const lastMsgs = context.recentMessages.slice(-5).join("|");
    return `${context.guildId}:${context.userId}:${lastMsgs}`;
  }

  private checkRateLimit(key: string, limits: Map<string, RateLimitEntry>, max: number): boolean {
    const now = Date.now();
    const entry = limits.get(key);
    if (!entry || now > entry.resetAt) {
      limits.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }

  async classify(context: AIContext): Promise<AIClassification | null> {
    if (!this.apiKey) return null;

    const cacheKey = this.getCacheKey(context);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    if (!this.checkRateLimit(`guild:${context.guildId}`, this.guildLimits, this.maxGuildRequests)) {
      return null;
    }
    if (!this.checkRateLimit(`user:${context.userId}:${context.guildId}`, this.userLimits, this.maxUserRequests)) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/discord-antispam-bot",
          "X-Title": "Discord Anti-Spam Bot",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `You are a Discord moderation AI. Analyze user behavior and classify it.

You MUST respond with ONLY valid JSON, no other text.

Response format:
{
  "is_spam": boolean,
  "confidence": number (0-1),
  "severity": number (0-100),
  "category": "normal" | "repetitive_spam" | "message_flood" | "reward_farming" | "link_spam" | "mention_spam" | "emoji_spam" | "character_spam" | "suspicious" | "unknown",
  "reason": "brief explanation",
  "recommended_action": "none" | "warning" | "timeout" | "severe_timeout"
}

Rules:
- Only flag as spam if behavior is genuinely malicious or disruptive
- Normal conversation, even if fast, is NOT spam
- Short messages alone are NOT spam unless combined with suspicious frequency
- Consider context: gaming chat, excitement, etc. are normal
- Be conservative: false positives are worse than missing spam`,
            },
            {
              role: "user",
              content: `Analyze this Discord user's behavior:

Recent messages:
${context.recentMessages.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Metadata:
- Messages in last 5 seconds: ${context.messagesLast5Seconds}
- Messages in last 10 seconds: ${context.messagesLast10Seconds}
- Messages in last minute: ${context.messagesLastMinute}
- Duplicate message ratio: ${(context.duplicateRatio * 100).toFixed(0)}%
- Current spam score: ${context.currentSpamScore}
- Previous warnings: ${context.previousWarnings}
- Detected category: ${context.category}`,
            },
          ],
          max_tokens: 256,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) return null;

      const parsed = this.parseResponse(content);
      if (parsed) {
        this.cache.set(cacheKey, { result: parsed, expiresAt: Date.now() + this.cacheTtlMs });
      }
      return parsed;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      return null;
    }
  }

  private parseResponse(content: string): AIClassification | null {
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      const parsed = JSON.parse(cleaned);

      if (typeof parsed.is_spam !== "boolean") return null;
      if (typeof parsed.confidence !== "number") return null;
      if (typeof parsed.severity !== "number") return null;

      const validCategories = Object.values(SpamCategory);
      if (!validCategories.includes(parsed.category)) {
        parsed.category = SpamCategory.UNKNOWN;
      }

      return {
        is_spam: parsed.is_spam,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
        severity: Math.max(0, Math.min(100, parsed.severity)),
        category: parsed.category,
        reason: typeof parsed.reason === "string" ? parsed.reason : "AI classification",
        recommended_action: typeof parsed.recommended_action === "string" ? parsed.recommended_action : "none",
      };
    } catch {
      return null;
    }
  }
}
