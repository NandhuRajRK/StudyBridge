import test from "node:test";
import assert from "node:assert/strict";

import { mergeConfig, DEFAULT_CONFIG } from "../electron/config.cjs";

test("mergeConfig: returns defaults when empty", () => {
  const merged = mergeConfig({});
  assert.equal(merged.ai.mode, DEFAULT_CONFIG.ai.mode);
  assert.equal(merged.ai.localBackend, DEFAULT_CONFIG.ai.localBackend);
  assert.deepEqual(merged.ai.cloudBudget, DEFAULT_CONFIG.ai.cloudBudget);
});

test("mergeConfig: preserves explicit overrides", () => {
  const merged = mergeConfig({
    ai: {
      mode: "cloud",
      cloudProvider: "openai",
      safetyLimits: { maxPromptChars: 1234 },
      cloudBudget: { dailyRequestLimit: 7 },
    },
  });

  assert.equal(merged.ai.mode, "cloud");
  assert.equal(merged.ai.cloudProvider, "openai");
  assert.equal(merged.ai.safetyLimits.maxPromptChars, 1234);
  assert.equal(merged.ai.cloudBudget.dailyRequestLimit, 7);
});

test("mergeConfig: migrates legacy ai.rateLimits into safetyLimits/cloudBudget", () => {
  const merged = mergeConfig({
    ai: {
      rateLimits: {
        maxPromptChars: 111,
        minRequestIntervalMs: 222,
        dailyRequestLimit: 3,
        dailyPromptCharLimit: 444,
        dailyResponseCharLimit: 555,
      },
      safetyLimits: {},
      cloudBudget: {},
    },
  });

  assert.equal(merged.ai.safetyLimits.maxPromptChars, 111);
  assert.equal(merged.ai.safetyLimits.minRequestIntervalMs, 222);
  assert.equal(merged.ai.cloudBudget.dailyRequestLimit, 3);
  assert.equal(merged.ai.cloudBudget.dailyPromptCharLimit, 444);
  assert.equal(merged.ai.cloudBudget.dailyResponseCharLimit, 555);
});

