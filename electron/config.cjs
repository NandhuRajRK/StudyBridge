const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_CONFIG = {
  ai: {
    mode: "ask",
    localModelConsent: false,
    cloudProvider: "google",
    agentProvider: "none",
    installedAgentProviders: {},
    googleApiKey: "",
    googleModel: "gemini-2.5-flash",
    safetyLimits: {
      maxPromptChars: 25000,
      minRequestIntervalMs: 2500,
    },
    cloudBudget: {
      dailyRequestLimit: 40,
      dailyPromptCharLimit: 120000,
      dailyResponseCharLimit: 120000,
    },
    cloudUsage: {
      windowStart: "",
      requestCount: 0,
      promptChars: 0,
      responseChars: 0,
      lastRequestAt: 0,
    },
  },
};

function getConfigPath(app) {
  return path.join(app.getPath("userData"), "studybridge-config.json");
}

async function readConfig(app) {
  const configPath = getConfigPath(app);
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return mergeConfig(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

async function writeConfig(app, config) {
  const configPath = getConfigPath(app);
  const merged = mergeConfig(config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function mergeConfig(config = {}) {
  const legacyRateLimits = config.ai?.rateLimits || {};
  const safetyLimits = config.ai?.safetyLimits || {};
  const cloudBudget = config.ai?.cloudBudget || {};
  const installedAgentProviders = config.ai?.installedAgentProviders || {};

  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...config,
    ai: {
      ...structuredClone(DEFAULT_CONFIG.ai),
      ...(config.ai || {}),
      installedAgentProviders: {
        ...installedAgentProviders,
      },
      safetyLimits: {
        ...structuredClone(DEFAULT_CONFIG.ai.safetyLimits),
        ...safetyLimits,
        maxPromptChars: safetyLimits.maxPromptChars ?? legacyRateLimits.maxPromptChars ?? DEFAULT_CONFIG.ai.safetyLimits.maxPromptChars,
        minRequestIntervalMs: safetyLimits.minRequestIntervalMs ?? legacyRateLimits.minRequestIntervalMs ?? DEFAULT_CONFIG.ai.safetyLimits.minRequestIntervalMs,
      },
      cloudBudget: {
        ...structuredClone(DEFAULT_CONFIG.ai.cloudBudget),
        ...cloudBudget,
        dailyRequestLimit: cloudBudget.dailyRequestLimit ?? legacyRateLimits.dailyRequestLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyRequestLimit,
        dailyPromptCharLimit: cloudBudget.dailyPromptCharLimit ?? legacyRateLimits.dailyPromptCharLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyPromptCharLimit,
        dailyResponseCharLimit: cloudBudget.dailyResponseCharLimit ?? legacyRateLimits.dailyResponseCharLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyResponseCharLimit,
      },
      cloudUsage: {
        ...structuredClone(DEFAULT_CONFIG.ai.cloudUsage),
        ...(config.ai?.cloudUsage || {}),
      },
    },
  };
}

module.exports = {
  DEFAULT_CONFIG,
  getConfigPath,
  readConfig,
  writeConfig,
  mergeConfig,
};
