const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { startLocalAi, getHardwarePreset } = require("./local-ai.cjs");
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
const appIconPath = path.join(process.cwd(), "public", "studybridge.png");
const codexModel = "gpt-5.1-codex-mini";
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
let codexLastRequestAt = 0;

function spawnEnv(extraEnv = {}) {
  const nextEnv = {
    ...process.env,
    ...extraEnv,
  };
  delete nextEnv.ELECTRON_RUN_AS_NODE;
  const pathKey = getPathKey(nextEnv);
  const pathEntries = (nextEnv[pathKey] || "").split(path.delimiter);
  nextEnv[pathKey] = unique([...pathEntries, ...getCommonCliDirs(nextEnv)]).join(path.delimiter);
  return nextEnv;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
}

function getCommonCliDirs(env) {
  const home = os.homedir();

  if (process.platform === "win32") {
    return unique([
      env.APPDATA && path.join(env.APPDATA, "npm"),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Volta", "bin"),
      env.ProgramFiles && path.join(env.ProgramFiles, "nodejs"),
      env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "nodejs"),
    ]);
  }

  return unique([
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    home && path.join(home, ".npm-global", "bin"),
    home && path.join(home, ".local", "bin"),
    home && path.join(home, ".bun", "bin"),
    home && path.join(home, ".volta", "bin"),
  ]);
}

function commandForPath(command) {
  if (process.platform === "win32" && command === "npm") {
    return `${command}.cmd`;
  }
  return command;
}

function shouldUseWindowsShell(command) {
  return process.platform === "win32" && (path.extname(command).toLowerCase() !== ".exe" || !path.isAbsolute(command));
}

function getCodexExecutableNames() {
  return process.platform === "win32" ? ["codex.cmd", "codex.exe", "codex.bat", "codex"] : ["codex"];
}

function fileExists(filePath) {
  try {
    return fsSync.existsSync(filePath);
  } catch {
    return false;
  }
}

function getCodexCommandCandidates() {
  const env = spawnEnv();
  const pathKey = getPathKey(env);
  const pathDirs = unique((env[pathKey] || "").split(path.delimiter));
  const absoluteCandidates = pathDirs.flatMap((dir) =>
    getCodexExecutableNames()
      .map((name) => path.join(dir, name))
      .filter(fileExists),
  );

  return unique(["codex", ...getCodexExecutableNames(), ...absoluteCandidates]);
}

async function resolveCodexCommand() {
  for (const command of getCodexCommandCandidates()) {
    try {
      const { stdout, stderr } = await runBufferedCommand(command, ["--version"], {
        timeoutMs: 15000,
      });
      return {
        ok: true,
        command,
        version: stdout.trim() || stderr.trim(),
      };
    } catch {
      // try next candidate
    }
  }

  return {
    ok: false,
    command: "codex",
    version: "",
    error: "Codex CLI was not found on PATH or in common install locations.",
  };
}

function quoteTerminalCommand(command) {
  if (!command.includes(" ")) {
    return command;
  }

  if (process.platform === "win32") {
    return `"${command.replace(/"/g, '""')}"`;
  }

  return `'${command.replace(/'/g, "'\\''")}'`;
}

function getCodexInstallCommand() {
  if (process.platform === "win32") {
    return 'npm install -g @openai/codex && "%APPDATA%\\npm\\codex.cmd" login';
  }

  return "npm install -g @openai/codex && codex login";
}

function launchRawTerminalCommand(command, title = "StudyBridge Codex Setup") {
  if (!command) {
    throw new Error("Unsupported terminal command request.");
  }

  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", title.replace(/"/g, ""), "cmd.exe", "/k", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env: spawnEnv(),
    });
    child.unref();
    return { launched: true };
  }

  if (process.platform === "darwin") {
    const child = spawn("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`], {
      detached: true,
      stdio: "ignore",
      env: spawnEnv(),
    });
    child.unref();
    return { launched: true };
  }

  const child = spawn("sh", ["-lc", `x-terminal-emulator -e ${JSON.stringify(command)} || gnome-terminal -- ${JSON.stringify(command)} || konsole -e ${JSON.stringify(command)}`], {
    detached: true,
    stdio: "ignore",
    env: spawnEnv(),
  });
  child.unref();
  return { launched: true };
}

function runBufferedCommand(command, args = [], { input = "", timeoutMs = 10 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const resolvedCommand = commandForPath(command);
    const child = spawn(resolvedCommand, args, {
      cwd,
      shell: shouldUseWindowsShell(resolvedCommand),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: spawnEnv(),
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      const error = new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s.`);
      error.stderr = stderr;
      error.stdout = stdout;
      reject(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      error.stderr = stderr;
      error.stdout = stdout;
      reject(error);
    });

    child.on("exit", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      const error = new Error(stderr.trim() || stdout.trim() || `Command exited with code ${code}`);
      error.stderr = stderr;
      error.stdout = stdout;
      error.code = code;
      reject(error);
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function runCodex(args = [], options = {}) {
  const status = await resolveCodexCommand();
  if (!status.ok) {
    throw new Error(status.error);
  }
  return runBufferedCommand(status.command, args, options);
}

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

function getCloudProviderLabel(provider) {
  if (provider === "google") return "Google";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Cloud";
}

function getCloudProviderKey(aiConfig = {}, provider = aiConfig.cloudProvider || "google") {
  if (provider === "openai") return aiConfig.openAiApiKey || "";
  if (provider === "anthropic") return aiConfig.anthropicApiKey || "";
  return aiConfig.googleApiKey || "";
}

function getCloudProviderModel(aiConfig = {}, provider = aiConfig.cloudProvider || "google") {
  if (provider === "openai") return aiConfig.openAiModel || "";
  if (provider === "anthropic") return aiConfig.anthropicModel || "claude-sonnet-4-0";
  return aiConfig.googleModel || "gemini-2.5-flash";
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
  const {
    googleApiKey: _googleApiKey,
    openAiApiKey: _openAiApiKey,
    anthropicApiKey: _anthropicApiKey,
    cloudUsage,
    rateLimits,
    ...rest
  } = ai;
  const usage = normalizeCloudUsage(ai);
  const limits = normalizeCloudBudget(ai);
  const safetyLimits = normalizeSafetyLimits(ai);
  const budget = getCloudBudgetState();

  return {
    ...rest,
    hasGoogleApiKey: Boolean(ai.googleApiKey),
    hasOpenAiApiKey: Boolean(ai.openAiApiKey),
    hasAnthropicApiKey: Boolean(ai.anthropicApiKey),
    installedAgentProviders: ai.installedAgentProviders || {},
    authorizedAgentProviders: ai.authorizedAgentProviders || {},
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
    icon: appIconPath,
    autoHideMenuBar: true,
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

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

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
  const cloudProvider = appConfig.ai?.cloudProvider || "google";
  return {
    ...localAiRuntime,
    aiMode: appConfig.ai?.mode || "disabled",
    localModelConsent: Boolean(appConfig.ai?.localModelConsent),
    cloudProvider,
    cloudModel: getCloudProviderModel(appConfig.ai || {}, cloudProvider),
    googleModel: appConfig.ai?.googleModel || "gemini-2.5-flash",
    openAiModel: appConfig.ai?.openAiModel || "",
    anthropicModel: appConfig.ai?.anthropicModel || "claude-sonnet-4-0",
    hasGoogleApiKey: Boolean(appConfig.ai?.googleApiKey),
    hasOpenAiApiKey: Boolean(appConfig.ai?.openAiApiKey),
    hasAnthropicApiKey: Boolean(appConfig.ai?.anthropicApiKey),
    installedAgentProviders: appConfig.ai?.installedAgentProviders || {},
    authorizedAgentProviders: appConfig.ai?.authorizedAgentProviders || {},
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
  const mode = appConfig.ai?.mode || "disabled";

  if (mode === "codex") {
    stopLocalRuntime();
    try {
      const status = await resolveCodexCommand();
      if (!status.ok) {
        throw new Error(status.error);
      }
      localAiRuntime = {
        ...getHardwarePreset(),
        mode: "codex",
        provider: "codex-cli",
        status: "ready",
        error: null,
        details: status.version,
        url: null,
      };
    } catch (error) {
      localAiRuntime = {
        ...getHardwarePreset(),
        mode: "codex",
        provider: "codex-cli",
        status: "missing_provider",
        error: "Codex CLI was not found on PATH.",
        details: error.message || String(error),
        url: null,
      };
    }
    return localAiRuntime;
  }

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
      error: "Choose local Gemma or add a cloud API key in Settings.",
      url: null,
    };
    return localAiRuntime;
  }

  if (mode === "cloud") {
    const budget = getCloudBudgetState();
    const cloudProvider = appConfig.ai?.cloudProvider || "google";
    const cloudKey = getCloudProviderKey(appConfig.ai || {}, cloudProvider);
    localAiRuntime = {
      ...getHardwarePreset(),
      mode: "cloud",
      provider: cloudProvider,
      model: getCloudProviderModel(appConfig.ai || {}, cloudProvider),
      status: cloudKey ? (budget.isLimited ? "rate_limited" : "ready") : "missing_key",
      error: cloudKey
        ? (budget.isLimited ? "Cloud AI budget reached. Open Settings to review limits or wait for the daily reset." : null)
        : `${getCloudProviderLabel(cloudProvider)} API key missing. Open Settings to add your key.`,
      url: null,
    };
    return localAiRuntime;
  }

  localAiRuntime = {
    ...getHardwarePreset(),
    mode: "disabled",
    status: "disabled",
    error: "AI is disabled. Open Settings to download Gemma locally or add a cloud API key.",
    url: null,
  };
  return localAiRuntime;
}

async function promptForAiSetup() {
  const response = await dialog.showMessageBox({
    type: "question",
    buttons: [
      "Use Codex CLI",
      "Download local Gemma model",
      "Not now",
    ],
    defaultId: 0,
    cancelId: 2,
    title: "StudyBridge AI setup",
    message: "Choose how you want AI to work in StudyBridge.",
    detail: "Codex CLI uses your local Codex login and does not store an OpenAI API key in this app. Local Gemma remains available for offline use.",
    noLink: true,
  });

  return response.response;
}

async function initializeAiMode() {
  appConfig = await readConfig(app);
  if (appConfig.ai?.agentProvider && appConfig.ai.agentProvider !== "none") {
    if (appConfig.ai.agentProvider === "codex-cli") {
      appConfig.ai.mode = "codex";
    }
    appConfig.ai.agentProvider = "none";
    appConfig = await writeConfig(app, appConfig);
  }
  if (appConfig.ai?.mode === "agent") {
    appConfig.ai.mode = "codex";
    appConfig.ai.agentProvider = "none";
    appConfig = await writeConfig(app, appConfig);
  }

  if (!appConfig.ai || appConfig.ai.mode === "ask") {
    const choice = await promptForAiSetup();
    if (choice === 0) {
      appConfig.ai.mode = "codex";
      appConfig.ai.agentProvider = "none";
    } else if (choice === 1) {
      appConfig.ai.mode = "local";
      appConfig.ai.localModelConsent = true;
    } else {
      appConfig.ai.mode = "disabled";
    }

    appConfig = await writeConfig(app, appConfig);
  }

  await syncRuntimeFromConfig();
}

ipcMain.handle("studybridge:get-runtime-config", () => runtimeForRenderer());
ipcMain.handle("codex:invoke", async (_event, payload = {}) => {
  const prompt = typeof payload === "string" ? payload : payload.prompt;
  const promptText = typeof prompt === "string" ? prompt : String(prompt || "");
  if (!promptText.trim()) {
    throw new Error("Prompt is empty.");
  }

  const safety = normalizeSafetyLimits(appConfig.ai || {});
  if (promptText.length > safety.maxPromptChars) {
    throw new Error(`Prompt is too large. Safety limit is ${safety.maxPromptChars} characters.`);
  }

  const now = Date.now();
  if (codexLastRequestAt && now - codexLastRequestAt < safety.minRequestIntervalMs) {
    throw new Error("You're sending requests too quickly. Wait a moment and try again.");
  }

  try {
    const { stdout } = await runCodex(
      ["exec", "-m", codexModel, "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-"],
      {
        input: promptText,
        cwd: app.getPath("userData"),
        timeoutMs: 20 * 60 * 1000,
      },
    );
    codexLastRequestAt = Date.now();
    return stdout;
  } catch (error) {
    const message = [
      error.message || "Codex CLI failed.",
      error.stderr ? `stderr:\n${error.stderr.trim()}` : "",
      error.stdout ? `stdout:\n${error.stdout.trim()}` : "",
    ].filter(Boolean).join("\n\n");
    throw new Error(message);
  }
});
ipcMain.handle("codex:status", async () => {
  const status = await resolveCodexCommand();
  return {
    installed: status.ok,
    version: status.version,
    command: status.ok ? status.command : "",
    error: status.ok ? null : status.error,
  };
});
ipcMain.handle("codex:login", async () => {
  const status = await resolveCodexCommand();
  return launchRawTerminalCommand(`${quoteTerminalCommand(status.ok ? status.command : "codex")} login`, "StudyBridge Codex Login");
});
ipcMain.handle("codex:install", () => launchRawTerminalCommand(getCodexInstallCommand(), "StudyBridge Codex Install"));
ipcMain.handle("studybridge:get-ai-settings", () => getSafeAiSettings());
ipcMain.handle("studybridge:set-ai-settings", async (_event, nextAiSettings) => {
  const current = appConfig.ai || {};
  const next = {
    ...current,
    ...(nextAiSettings || {}),
  };

  const syncKey = (field, clearFlag) => {
    if (!Object.prototype.hasOwnProperty.call(nextAiSettings || {}, field)) {
      next[field] = current[field] || "";
      return;
    }
    if (nextAiSettings?.[clearFlag]) {
      next[field] = "";
      return;
    }
    if (!nextAiSettings?.[field] && current[field]) {
      next[field] = current[field];
    }
  };

  syncKey("googleApiKey", "clearGoogleApiKey");
  syncKey("openAiApiKey", "clearOpenAiApiKey");
  syncKey("anthropicApiKey", "clearAnthropicApiKey");

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
async function invokeCloudProvider(payload = {}) {
  const aiConfig = appConfig.ai || {};
  const provider = typeof payload.provider === "string" && payload.provider.trim()
    ? payload.provider.trim()
    : (aiConfig.cloudProvider || "google");
  const apiKey = getCloudProviderKey(aiConfig, provider);
  const safety = normalizeSafetyLimits(aiConfig);
  const budgetLimits = normalizeCloudBudget(aiConfig);
  const usage = normalizeCloudUsage(aiConfig);
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const responseJsonSchema = payload.response_json_schema || null;
  const model = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : getCloudProviderModel(aiConfig, provider);

  if (!apiKey) {
    const error = new Error(`${getCloudProviderLabel(provider)} API key missing. Open Settings to add your key.`);
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

  let text = "";
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are StudyBridge's cloud tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
          },
          {
            role: "user",
            content: `${prompt}${buildSchemaHint(responseJsonSchema)}`,
          },
        ],
        temperature: responseJsonSchema ? 0.15 : 0.35,
        top_p: 0.9,
        max_tokens: responseJsonSchema ? 2048 : 1024,
        ...(responseJsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      const error = new Error(`OpenAI request failed: ${response.status} ${rawText}`);
      error.code = "AI_REQUEST_FAILED";
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      const parseError = new Error(`OpenAI returned invalid JSON: ${error.message}`);
      parseError.code = "AI_REQUEST_FAILED";
      throw parseError;
    }

    text = parsed?.choices?.[0]?.message?.content || "";
  } else if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: responseJsonSchema ? 2048 : 1024,
        temperature: responseJsonSchema ? 0.15 : 0.35,
        top_p: 0.9,
        system: "You are StudyBridge's cloud tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
        messages: [
          {
            role: "user",
            content: `${prompt}${buildSchemaHint(responseJsonSchema)}`,
          },
        ],
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      const error = new Error(`Anthropic request failed: ${response.status} ${rawText}`);
      error.code = "AI_REQUEST_FAILED";
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      const parseError = new Error(`Anthropic returned invalid JSON: ${error.message}`);
      parseError.code = "AI_REQUEST_FAILED";
      throw parseError;
    }

    text = parsed?.content?.map((part) => part.text || "").join("") || "";
  } else {
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

    text = parsed?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  }

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
}
ipcMain.handle("studybridge:invoke-cloud-provider", async (_event, payload = {}) => invokeCloudProvider(payload));
ipcMain.handle("studybridge:invoke-google-gemini", async (_event, payload = {}) => invokeCloudProvider({ ...payload, provider: "google" }));
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
