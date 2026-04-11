const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { startLocalAi, getHardwarePreset } = require("./local-ai.cjs");
const { detectAgentProvider, installAgentProvider, invokeAgentProvider } = require("./agent-adapters.cjs");
const { DEFAULT_CONFIG, readConfig, writeConfig, mergeConfig } = require("./config.cjs");
const {
  listRows,
  createRow,
  updateRow,
  deleteRow,
  getProfile,
  updateProfile,
  resetProfile,
  saveUpload,
  deleteLocalFile,
} = require("./local-store.cjs");

const devServerUrl = process.env.ELECTRON_START_URL;
let mainWindow = null;
let appConfig = mergeConfig(DEFAULT_CONFIG);
let localAiRuntime = {
  mode: "disabled",
  status: "disabled",
  error: null,
  url: "http://127.0.0.1:8080",
  ...getHardwarePreset(),
};
let localAiPromise = null;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCloudUsage(aiConfig = {}) {
  const usage = aiConfig.cloudUsage || {};
  const today = getTodayKey();
  if (usage.windowStart !== today) {
    return {
      windowStart: today,
      requestCount: 0,
      promptChars: 0,
      responseChars: 0,
      lastRequestAt: 0,
    };
  }

  return {
    windowStart: usage.windowStart || today,
    requestCount: Number.isFinite(usage.requestCount) ? usage.requestCount : 0,
    promptChars: Number.isFinite(usage.promptChars) ? usage.promptChars : 0,
    responseChars: Number.isFinite(usage.responseChars) ? usage.responseChars : 0,
    lastRequestAt: Number.isFinite(usage.lastRequestAt) ? usage.lastRequestAt : 0,
  };
}

function normalizeSafetyLimits(aiConfig = {}) {
  const legacy = aiConfig.rateLimits || {};
  const safety = aiConfig.safetyLimits || {};
  return {
    ...DEFAULT_CONFIG.ai.safetyLimits,
    ...safety,
    maxPromptChars: safety.maxPromptChars ?? legacy.maxPromptChars ?? DEFAULT_CONFIG.ai.safetyLimits.maxPromptChars,
    minRequestIntervalMs: safety.minRequestIntervalMs ?? legacy.minRequestIntervalMs ?? DEFAULT_CONFIG.ai.safetyLimits.minRequestIntervalMs,
  };
}

function normalizeCloudBudget(aiConfig = {}) {
  const legacy = aiConfig.rateLimits || {};
  const budget = aiConfig.cloudBudget || {};
  return {
    ...DEFAULT_CONFIG.ai.cloudBudget,
    ...budget,
    dailyRequestLimit: budget.dailyRequestLimit ?? legacy.dailyRequestLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyRequestLimit,
    dailyPromptCharLimit: budget.dailyPromptCharLimit ?? legacy.dailyPromptCharLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyPromptCharLimit,
    dailyResponseCharLimit: budget.dailyResponseCharLimit ?? legacy.dailyResponseCharLimit ?? DEFAULT_CONFIG.ai.cloudBudget.dailyResponseCharLimit,
  };
}

function getCloudBudgetState() {
  const aiConfig = appConfig.ai || {};
  const usage = normalizeCloudUsage(aiConfig);
  const limits = normalizeCloudBudget(aiConfig);
  const now = Date.now();
  const nextResetAt = new Date(`${usage.windowStart}T23:59:59.999Z`).toISOString();
  const requestLimitReached = usage.requestCount >= limits.dailyRequestLimit;
  const promptLimitReached = usage.promptChars >= limits.dailyPromptCharLimit;
  const responseLimitReached = usage.responseChars >= limits.dailyResponseCharLimit;
  const cooldownActive = Boolean(usage.lastRequestAt && now - usage.lastRequestAt < limits.minRequestIntervalMs);

  return {
    usage,
    limits,
    nextResetAt,
    requestLimitReached,
    promptLimitReached,
    responseLimitReached,
    cooldownActive,
    isLimited: requestLimitReached || promptLimitReached || responseLimitReached || cooldownActive,
  };
}

function getSafetyGuardState() {
  const aiConfig = appConfig.ai || {};
  const safety = normalizeSafetyLimits(aiConfig);
  return {
    ...safety,
    maxPromptChars: safety.maxPromptChars,
    minRequestIntervalMs: safety.minRequestIntervalMs,
  };
}

function setCloudUsage(nextUsage) {
  appConfig = {
    ...appConfig,
    ai: {
      ...appConfig.ai,
      cloudUsage: nextUsage,
    },
  };
}

function getSafeAiSettings() {
  const ai = appConfig.ai || {};
  const { googleApiKey: _googleApiKey, cloudUsage, rateLimits, ...rest } = ai;
  const usage = normalizeCloudUsage(ai);
  const limits = normalizeCloudBudget(ai);
  const safetyLimits = normalizeSafetyLimits(ai);
  const budget = getCloudBudgetState();

  return {
    ...rest,
    hasGoogleApiKey: Boolean(ai.googleApiKey),
    cloudUsage: usage,
    rateLimits: limits,
    safetyLimits,
    cloudBudget: {
      ...budget,
      usage,
      limits,
    },
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    title: "StudyBridge",
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }
    event.preventDefault();
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(app.getAppPath(), "dist", "index.html");
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function runtimeForRenderer() {
  const budget = getCloudBudgetState();
  const safetyLimits = normalizeSafetyLimits(appConfig.ai || {});
  return {
    ...localAiRuntime,
    aiMode: appConfig.ai?.mode || "disabled",
    localModelConsent: Boolean(appConfig.ai?.localModelConsent),
    cloudProvider: appConfig.ai?.cloudProvider || "google",
    googleModel: appConfig.ai?.googleModel || "gemini-2.5-flash",
    hasGoogleApiKey: Boolean(appConfig.ai?.googleApiKey),
    cloudBudget: budget,
    safetyLimits,
  };
}

function stopLocalRuntime() {
  if (localAiRuntime?.stop) {
    localAiRuntime.stop();
  }
  localAiPromise = null;
}

async function syncRuntimeFromConfig() {
  const agentProvider = appConfig.ai?.agentProvider && appConfig.ai.agentProvider !== "none"
    ? appConfig.ai.agentProvider
    : "";
  if (agentProvider) {
    stopLocalRuntime();
    const providerStatus = await detectAgentProvider(agentProvider);
    localAiRuntime = {
      ...getHardwarePreset(),
      mode: "agent",
      provider: agentProvider,
      status: providerStatus.status === "ready" ? "ready" : (providerStatus.status === "missing" ? "missing_provider" : "error"),
      error: providerStatus.error || null,
      details: providerStatus.details || null,
      url: null,
    };
    return localAiRuntime;
  }

  const mode = appConfig.ai?.mode || "disabled";

  if (mode === "local" && appConfig.ai?.localModelConsent) {
    stopLocalRuntime();
    localAiRuntime = {
      ...localAiRuntime,
      mode: "local",
      status: "downloading-model",
      error: null,
    };

    localAiPromise = startLocalAi(app)
      .then((runtime) => {
        localAiRuntime = {
          ...runtime,
          mode: "local",
          status: runtime.status || "ready",
          error: null,
        };
        return localAiRuntime;
      })
      .catch((error) => {
        localAiRuntime = {
          ...localAiRuntime,
          mode: "local",
          status: "error",
          error: error.message || String(error),
        };
        return localAiRuntime;
      });

    return localAiPromise;
  }

  stopLocalRuntime();

  if (mode === "ask") {
    localAiRuntime = {
      ...getHardwarePreset(),
      mode: "ask",
      status: "awaiting_choice",
      error: "Choose local Gemma or add a Google API key in Settings.",
      url: null,
    };
    return localAiRuntime;
  }

  if (mode === "cloud") {
    const budget = getCloudBudgetState();
    localAiRuntime = {
      ...getHardwarePreset(),
      mode: "cloud",
      status: appConfig.ai?.googleApiKey ? (budget.isLimited ? "rate_limited" : "ready") : "missing_key",
      error: appConfig.ai?.googleApiKey
        ? (budget.isLimited ? "Cloud AI budget reached. Open Settings to review limits or wait for the daily reset." : null)
        : "Google API key missing. Open Settings to add your key.",
      url: null,
    };
    return localAiRuntime;
  }

  localAiRuntime = {
    ...getHardwarePreset(),
    mode: "disabled",
    status: "disabled",
    error: "AI is disabled. Open Settings to download Gemma locally or add a Google API key.",
    url: null,
  };
  return localAiRuntime;
}

async function promptForAiSetup() {
  const response = await dialog.showMessageBox({
    type: "question",
    buttons: [
      "Download local Gemma model",
      "Use Google API key",
      "Not now",
    ],
    defaultId: 0,
    cancelId: 2,
    title: "StudyBridge AI setup",
    message: "Choose how you want AI to work in StudyBridge.",
    detail: "Local Gemma runs offline through llama.cpp. If you prefer cloud AI, you can add a Google API key later in Settings.",
    noLink: true,
  });

  return response.response;
}

async function initializeAiMode() {
  appConfig = await readConfig(app);

  if (!appConfig.ai || appConfig.ai.mode === "ask") {
    const choice = await promptForAiSetup();
    if (choice === 0) {
      appConfig.ai.mode = "local";
      appConfig.ai.localModelConsent = true;
    } else if (choice === 1) {
      appConfig.ai.mode = "cloud";
    } else {
      appConfig.ai.mode = "disabled";
    }

    appConfig = await writeConfig(app, appConfig);
  }

  await syncRuntimeFromConfig();
}

ipcMain.handle("studybridge:get-runtime-config", () => runtimeForRenderer());
ipcMain.handle("studybridge:get-ai-settings", () => getSafeAiSettings());
ipcMain.handle("studybridge:set-ai-settings", async (_event, nextAiSettings) => {
  const current = appConfig.ai || {};
  const next = {
    ...current,
    ...(nextAiSettings || {}),
  };

  if (!Object.prototype.hasOwnProperty.call(nextAiSettings || {}, "googleApiKey")) {
    next.googleApiKey = current.googleApiKey || "";
  } else if (nextAiSettings?.clearGoogleApiKey) {
    next.googleApiKey = "";
  } else if (!nextAiSettings?.googleApiKey && current.googleApiKey) {
    next.googleApiKey = current.googleApiKey;
  }

  if (!Object.prototype.hasOwnProperty.call(nextAiSettings || {}, "cloudUsage")) {
    next.cloudUsage = normalizeCloudUsage(current);
  }

  if (!Object.prototype.hasOwnProperty.call(nextAiSettings || {}, "cloudBudget")) {
    next.cloudBudget = normalizeCloudBudget(current);
  }

  if (!Object.prototype.hasOwnProperty.call(nextAiSettings || {}, "safetyLimits")) {
    next.safetyLimits = normalizeSafetyLimits(current);
  }

  appConfig = await writeConfig(app, {
    ...appConfig,
    ai: next,
  });
  await syncRuntimeFromConfig();
  return getSafeAiSettings();
});
ipcMain.handle("studybridge:wait-local-ai", async () => {
  if (localAiPromise) {
    try {
      await localAiPromise;
    } catch {
      // leave the current runtime state in place; the renderer will fall back if needed
    }
  }

  return runtimeForRenderer();
});
ipcMain.handle("studybridge:invoke-agent-runtime", async (_event, payload = {}) => {
  const aiConfig = appConfig.ai || {};
  const provider = typeof payload.provider === "string" && payload.provider.trim() && payload.provider !== "none"
    ? payload.provider.trim()
    : (aiConfig.agentProvider && aiConfig.agentProvider !== "none" ? aiConfig.agentProvider : "");
  if (!provider) {
    const error = new Error("No external agent provider is selected.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  if (!prompt.trim()) {
    throw new Error("Prompt is empty.");
  }

  const responseJsonSchema = payload.response_json_schema || null;
  const cwd = await fs.mkdtemp(path.join(app.getPath("userData"), "agent-runtime-"));
  return invokeAgentProvider(provider, {
    prompt,
    response_json_schema: responseJsonSchema,
    cwd,
  });
});
ipcMain.handle("studybridge:install-agent-provider", async (_event, provider) => {
  if (!provider || provider === "none") {
    throw new Error("No external agent provider selected.");
  }

  const result = await installAgentProvider(provider);
  if (appConfig.ai?.agentProvider === provider) {
    await syncRuntimeFromConfig();
  }

  return {
    provider,
    ...result,
    runtime: runtimeForRenderer(),
  };
});
ipcMain.handle("studybridge:invoke-google-gemini", async (_event, payload = {}) => {
  const aiConfig = appConfig.ai || {};
  const apiKey = aiConfig.googleApiKey;
  const safety = normalizeSafetyLimits(aiConfig);
  const budgetLimits = normalizeCloudBudget(aiConfig);
  const usage = normalizeCloudUsage(aiConfig);
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const responseJsonSchema = payload.response_json_schema || null;
  const model = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : (aiConfig.googleModel || "gemini-2.5-flash");

  if (!apiKey) {
    const error = new Error("Google API key missing. Open Settings to add your key.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  if (!prompt.trim()) {
    throw new Error("Prompt is empty.");
  }

  if (prompt.length > safety.maxPromptChars) {
    const error = new Error(`Prompt is too large. Safety limit is ${safety.maxPromptChars} characters.`);
    error.code = "AI_RATE_LIMITED";
    throw error;
  }

  const now = Date.now();
  if (usage.lastRequestAt && now - usage.lastRequestAt < safety.minRequestIntervalMs) {
    const error = new Error("You're sending requests too quickly. Wait a moment and try again.");
    error.code = "AI_RATE_LIMITED";
    throw error;
  }

  if (usage.requestCount >= budgetLimits.dailyRequestLimit) {
    const error = new Error("Cloud AI daily request limit reached. Open Settings or wait for the reset.");
    error.code = "AI_RATE_LIMITED";
    throw error;
  }

  if (usage.promptChars >= budgetLimits.dailyPromptCharLimit || usage.responseChars >= budgetLimits.dailyResponseCharLimit) {
    const error = new Error("Cloud AI daily usage limit reached. Open Settings or wait for the reset.");
    error.code = "AI_RATE_LIMITED";
    throw error;
  }

  const buildSchemaHint = (schema) => {
    if (!schema) return "";
    return `\n\nReturn ONLY valid JSON. Match this schema as closely as possible:\n${JSON.stringify(schema, null, 2)}`;
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${prompt}${buildSchemaHint(responseJsonSchema)}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: responseJsonSchema ? 0.15 : 0.35,
        topP: 0.9,
        maxOutputTokens: responseJsonSchema ? 2048 : 1024,
        ...(responseJsonSchema ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const error = new Error(`Google AI request failed: ${response.status} ${rawText}`);
    error.code = "AI_REQUEST_FAILED";
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const parseError = new Error(`Google AI returned invalid JSON: ${error.message}`);
    parseError.code = "AI_REQUEST_FAILED";
    throw parseError;
  }

  const text = parsed?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const nextUsage = {
    windowStart: usage.windowStart || getTodayKey(),
    requestCount: usage.requestCount + 1,
    promptChars: usage.promptChars + prompt.length,
    responseChars: usage.responseChars + text.length,
    lastRequestAt: Date.now(),
  };
  setCloudUsage(nextUsage);
  appConfig = await writeConfig(app, appConfig);

  if (!responseJsonSchema) {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
});
ipcMain.handle("studybridge:get-local-profile", async () => getProfile(app));
ipcMain.handle("studybridge:update-local-profile", async (_event, payload) => updateProfile(app, payload));
ipcMain.handle("studybridge:reset-local-profile", async () => resetProfile(app));
ipcMain.handle("studybridge:list-local-entity", async (_event, entityName) => listRows(app, entityName));
ipcMain.handle("studybridge:create-local-entity", async (_event, entityName, payload) => createRow(app, entityName, payload));
ipcMain.handle("studybridge:update-local-entity", async (_event, entityName, id, payload) => updateRow(app, entityName, id, payload));
ipcMain.handle("studybridge:delete-local-entity", async (_event, entityName, id) => deleteRow(app, entityName, id));
ipcMain.handle("studybridge:upload-local-file", async (_event, payload) => saveUpload(app, payload));
ipcMain.handle("studybridge:delete-local-file", async (_event, fileUrl) => deleteLocalFile(app, fileUrl));

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await initializeAiMode();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("before-quit", () => {
    stopLocalRuntime();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
