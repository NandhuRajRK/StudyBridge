const fs = require("node:fs/promises");
const path = require("node:path");

let keytar = null;
try {
  keytar = require("keytar");
} catch {
  keytar = null;
}

const KEYCHAIN_SERVICE = "StudyBridge";
const KEY_ACCOUNTS = {
  google: "studybridge-google-api-key",
  openai: "studybridge-openai-api-key",
  anthropic: "studybridge-anthropic-api-key",
};

const DEFAULT_CONFIG = {
  setup: {
    localAiChecked: false,
    ollamaChecked: false,
  },
  ai: {
    mode: "ask",
    localBackend: "llama_cpp",
    localModelConsent: false,
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "gemma4:e2b",
    cloudProvider: "google",
    agentProvider: "none",
    installedAgentProviders: {},
    authorizedAgentProviders: {},
    googleApiKey: "",
    openAiApiKey: "",
    anthropicApiKey: "",
    googleModel: "gemini-2.5-flash",
    openAiModel: "",
    anthropicModel: "claude-sonnet-4-0",
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

async function readSecret(key) {
  if (!keytar) return null;
  try {
    return await keytar.getPassword(KEYCHAIN_SERVICE, key);
  } catch {
    return null;
  }
}

async function writeSecret(key, value) {
  if (!keytar) return false;
  try {
    if (!value) {
      await keytar.deletePassword(KEYCHAIN_SERVICE, key);
      return true;
    }
    await keytar.setPassword(KEYCHAIN_SERVICE, key, String(value));
    return true;
  } catch {
    return false;
  }
}

async function readConfig(app) {
  const configPath = getConfigPath(app);
  let base = null;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    base = mergeConfig(JSON.parse(raw));
  } catch {
    base = structuredClone(DEFAULT_CONFIG);
  }

  if (keytar) {
    try {
      const google = await readSecret(KEY_ACCOUNTS.google);
      const openai = await readSecret(KEY_ACCOUNTS.openai);
      const anthropic = await readSecret(KEY_ACCOUNTS.anthropic);
      base.ai = base.ai || {};
      if (google) base.ai.googleApiKey = google;
      if (openai) base.ai.openAiApiKey = openai;
      if (anthropic) base.ai.anthropicApiKey = anthropic;
    } catch {
      // fall back to file-backed values
    }
  }

  return base;
}

async function writeConfig(app, config) {
  const configPath = getConfigPath(app);
  const merged = mergeConfig(config);

  if (keytar && merged?.ai) {
    const googleOk = await writeSecret(
      KEY_ACCOUNTS.google,
      merged.ai.googleApiKey || "",
    );
    const openaiOk = await writeSecret(
      KEY_ACCOUNTS.openai,
      merged.ai.openAiApiKey || "",
    );
    const anthropicOk = await writeSecret(
      KEY_ACCOUNTS.anthropic,
      merged.ai.anthropicApiKey || "",
    );

    merged.ai = {
      ...merged.ai,
      googleApiKey: googleOk ? "" : merged.ai.googleApiKey,
      openAiApiKey: openaiOk ? "" : merged.ai.openAiApiKey,
      anthropicApiKey: anthropicOk ? "" : merged.ai.anthropicApiKey,
    };
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

function mergeConfig(config = {}) {
  const legacyRateLimits = config.ai?.rateLimits || {};
  const safetyLimits = config.ai?.safetyLimits || {};
  const cloudBudget = config.ai?.cloudBudget || {};
  const installedAgentProviders = config.ai?.installedAgentProviders || {};
  const authorizedAgentProviders = config.ai?.authorizedAgentProviders || {};

  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...config,
    ai: {
      ...structuredClone(DEFAULT_CONFIG.ai),
      ...(config.ai || {}),
      installedAgentProviders: {
        ...installedAgentProviders,
      },
      authorizedAgentProviders: {
        ...authorizedAgentProviders,
      },
      safetyLimits: {
        ...structuredClone(DEFAULT_CONFIG.ai.safetyLimits),
        ...safetyLimits,
        maxPromptChars:
          safetyLimits.maxPromptChars ??
          legacyRateLimits.maxPromptChars ??
          DEFAULT_CONFIG.ai.safetyLimits.maxPromptChars,
        minRequestIntervalMs:
          safetyLimits.minRequestIntervalMs ??
          legacyRateLimits.minRequestIntervalMs ??
          DEFAULT_CONFIG.ai.safetyLimits.minRequestIntervalMs,
      },
      cloudBudget: {
        ...structuredClone(DEFAULT_CONFIG.ai.cloudBudget),
        ...cloudBudget,
        dailyRequestLimit:
          cloudBudget.dailyRequestLimit ??
          legacyRateLimits.dailyRequestLimit ??
          DEFAULT_CONFIG.ai.cloudBudget.dailyRequestLimit,
        dailyPromptCharLimit:
          cloudBudget.dailyPromptCharLimit ??
          legacyRateLimits.dailyPromptCharLimit ??
          DEFAULT_CONFIG.ai.cloudBudget.dailyPromptCharLimit,
        dailyResponseCharLimit:
          cloudBudget.dailyResponseCharLimit ??
          legacyRateLimits.dailyResponseCharLimit ??
          DEFAULT_CONFIG.ai.cloudBudget.dailyResponseCharLimit,
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
