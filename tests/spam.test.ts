import { describe, it, expect, beforeEach, vi } from "vitest";
import { LocalSpamDetector } from "../src/spam/detector";
import { GuildSettings, SpamCategory, UserState } from "../src/types";
import { getDefaultGuildSettings, getDefaultWeights } from "../src/config";

function createTestSettings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return { ...getDefaultGuildSettings("test-guild"), ...overrides };
}

function createDetector(settings?: GuildSettings) {
  const s = settings || createTestSettings();
  return new LocalSpamDetector(() => s);
}

describe("LocalSpamDetector", () => {
  let detector: LocalSpamDetector;

  beforeEach(() => {
    detector = createDetector();
  });

  it("should return low score for a single normal message", () => {
    const result = detector.analyze("user1", "guild1", "Hello everyone!", "ch1");
    expect(result.score).toBeLessThan(20);
    expect(result.category).toBe(SpamCategory.NORMAL);
  });

  it("should detect rapid identical messages as spam", () => {
    for (let i = 0; i < 8; i++) {
      detector.analyze("user1", "guild1", "gg", "ch1");
    }
    const result = detector.analyze("user1", "guild1", "gg", "ch1");
    expect(result.score).toBeGreaterThan(40);
    expect(
      result.category === SpamCategory.REPETITIVE_SPAM ||
      result.category === SpamCategory.REWARD_FARMING
    ).toBe(true);
  });

  it("should detect reward farming patterns", () => {
    const messages = ["reward", "give reward", "gg", "reward", "reward", "gg", "reward"];
    for (const msg of messages) {
      detector.analyze("user1", "guild1", msg, "ch1");
    }
    const result = detector.analyze("user1", "guild1", "reward", "ch1");
    expect(result.score).toBeGreaterThan(40);
    expect(result.category).toBe(SpamCategory.REWARD_FARMING);
  });

  it("should not flag different messages from different users", () => {
    detector.analyze("user1", "guild1", "Hello!", "ch1");
    detector.analyze("user2", "guild1", "Hey there!", "ch1");
    detector.analyze("user3", "guild1", "What's up?", "ch1");

    const result1 = detector.analyze("user1", "guild1", "How are you?", "ch1");
    const result2 = detector.analyze("user2", "guild1", "I'm good!", "ch1");

    expect(result1.score).toBeLessThan(30);
    expect(result2.score).toBeLessThan(30);
  });

  it("should detect cross-channel spam", () => {
    for (let i = 0; i < 5; i++) {
      detector.analyze("user1", "guild1", `hello ${i}`, "ch1");
    }
    for (let i = 0; i < 5; i++) {
      detector.analyze("user1", "guild1", `hello ${i}`, "ch2");
    }
    const result = detector.analyze("user1", "guild1", "hello", "ch3");
    expect(result.factors.crossChannelSpam).toBeGreaterThan(0);
  });

  it("should detect excessive caps", () => {
    const result = detector.analyze("user1", "guild1", "STOP SPAMMING RIGHT NOW PLEASE", "ch1");
    expect(result.factors.capsRatio).toBeGreaterThan(70);
  });

  it("should detect link spam", () => {
    detector.analyze("user1", "guild1", "https://spam.com", "ch1");
    detector.analyze("user1", "guild1", "https://spam.com", "ch1");
    detector.analyze("user1", "guild1", "https://spam.com", "ch1");
    const result = detector.analyze("user1", "guild1", "https://spam.com", "ch1");
    expect(result.factors.linkRepetition).toBeGreaterThan(0);
  });

  it("should detect mention spam", () => {
    const result = detector.analyze(
      "user1",
      "guild1",
      "<@123> <@456> <@789> <@111> <@222> <@333>",
      "ch1"
    );
    expect(result.factors.mentionExcess).toBeGreaterThan(0);
  });

  it("should detect emoji spam", () => {
    const result = detector.analyze("user1", "guild1", "😀😀😀😀😀😀😀😀😀😀", "ch1");
    expect(result.factors.emojiExcess).toBeGreaterThan(0);
  });

  it("should handle alternating phrases", () => {
    const phrases = ["hello", "world", "hello", "world", "hello", "world", "hello", "world"];
    for (const p of phrases) {
      detector.analyze("user1", "guild1", p, "ch1");
    }
    const result = detector.analyze("user1", "guild1", "hello", "ch1");
    expect(result.score).toBeGreaterThan(30);
  });

  it("should reset profile correctly", () => {
    for (let i = 0; i < 5; i++) {
      detector.analyze("user1", "guild1", "spam", "ch1");
    }
    detector.resetProfile("user1", "guild1");
    const profile = detector.getProfile("user1", "guild1");
    expect(profile.messages).toHaveLength(0);
    expect(profile.currentScore).toBe(0);
  });

  it("should calculate factors for repeated short messages", () => {
    for (let i = 0; i < 6; i++) {
      detector.analyze("user1", "guild1", "x", "ch1");
    }
    const result = detector.analyze("user1", "guild1", "x", "ch1");
    expect(result.score).toBeGreaterThan(30);
    expect(result.factors.repetitionScore).toBeGreaterThan(0);
  });

  it("should not flag rapid but varied messages as hard", () => {
    const msgs = [
      "WAIT",
      "NO WAY",
      "THAT ACTUALLY WORKED",
      "HAHAHAHA",
      "I CANT BELIEVE IT",
      "THATS INSANE",
    ];
    for (const msg of msgs) {
      detector.analyze("user1", "guild1", msg, "ch1");
    }
    const result = detector.analyze("user1", "guild1", "OMG", "ch1");
    expect(result.score).toBeLessThan(60);
  });
});

describe("Spam Score Thresholds", () => {
  it("should categorize scores correctly", () => {
    const detector = createDetector(
      createTestSettings({
        warningThreshold: 45,
        timeoutThreshold: 65,
        severeTimeoutThreshold: 80,
        extremeThreshold: 95,
      })
    );

    for (let i = 0; i < 15; i++) {
      detector.analyze("user1", "guild1", "gg", "ch1");
    }
    const result = detector.analyze("user1", "guild1", "gg", "ch1");

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("Multiple Users", () => {
  it("should track users independently", () => {
    const detector = createDetector();

    for (let i = 0; i < 10; i++) {
      detector.analyze("spammer", "guild1", "spam", "ch1");
    }
    detector.analyze("normal", "guild1", "Hello!", "ch1");

    const spamResult = detector.analyze("spammer", "guild1", "spam", "ch1");
    const normalResult = detector.analyze("normal", "guild1", "How are you?", "ch1");

    expect(spamResult.score).toBeGreaterThan(normalResult.score);
  });
});

describe("Edge Cases", () => {
  let detector: LocalSpamDetector;

  beforeEach(() => {
    detector = createDetector();
  });

  it("should handle empty messages", () => {
    const result = detector.analyze("user1", "guild1", "", "ch1");
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("should handle very long messages", () => {
    const longMsg = "a".repeat(2000);
    const result = detector.analyze("user1", "guild1", longMsg, "ch1");
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("should handle unicode characters", () => {
    const result = detector.analyze("user1", "guild1", "こんにちは 🌍", "ch1");
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
