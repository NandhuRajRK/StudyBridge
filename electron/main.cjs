const { app, BrowserWindow, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { startLocalAi, getHardwarePreset, getCachedLlamaBinary } = require("./local-ai.cjs");
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
const LOG_FILE_NAME = "studybridge-main.log";
const OLLAMA_INSTALL_ID = "Ollama.Ollama";
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = "gemma4:e2b";

function normalizeOllamaUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return DEFAULT_OLLAMA_URL;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

function getOllamaHostEnv(url) {
  const normalized = normalizeOllamaUrl(url);
  try {
    const parsed = new URL(normalized);
    return parsed.host || "127.0.0.1:11434";
  } catch {
    return "127.0.0.1:11434";
  }
}

async function isLocalAiServerReady(url) {
  if (!url) return false;
  try {
    const response = await fetch(`${url}/v1/models`);
    return response.ok;
  } catch {
    return false;
  }
}

function getLocalBackendConfig() {
  const ai = appConfig.ai || {};
  return {
    localBackend: ai.localBackend || "llama_cpp",
    ollamaUrl: normalizeOllamaUrl(ai.ollamaUrl),
    ollamaModel: ai.ollamaModel || DEFAULT_OLLAMA_MODEL,
  };
}

function getLocalSetupFlag(localBackend) {
  return localBackend === "ollama" ? "ollamaChecked" : "localAiChecked";
}

async function isOllamaServerReady(url) {
  if (!url) return false;
  try {
    const response = await fetch(`${url}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function listOllamaModels(url) {
  if (!url) return [];
  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.models) ? data.models : [];
  } catch {
    return [];
  }
}

async function hasOllamaModel(url, modelName) {
  const models = await listOllamaModels(url);
  const target = String(modelName || "").toLowerCase();
  return models.some((model) => String(model?.name || "").toLowerCase() === target);
}

function waitForOllamaRuntime(url, modelName, timeoutMs = 20 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for Ollama to start"));
        return;
      }

      try {
        const serverReady = await isOllamaServerReady(url);
        if (serverReady && (!modelName || await hasOllamaModel(url, modelName))) {
          resolve();
          return;
        }
      } catch {
        // keep waiting
      }

      setTimeout(tick, 3000);
    };

    tick();
  });
}

async function resolveOllamaCommand() {
  try {
    await runBufferedCommand("ollama", ["--version"], { timeoutMs: 15000 });
    return { ok: true, command: "ollama" };
  } catch (error) {
    return { ok: false, command: "ollama", error: error?.message || String(error) };
  }
}

async function resolveWingetCommand() {
  try {
    await runBufferedCommand("winget", ["--version"], { timeoutMs: 15000 });
    return { ok: true, command: "winget" };
  } catch (error) {
    return { ok: false, command: "winget", error: error?.message || String(error) };
  }
}

function startOllamaServer(command = "ollama", url = DEFAULT_OLLAMA_URL) {
  const ollamaHost = getOllamaHostEnv(url);
  const child = spawn(command, ["serve"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: spawnEnv({ OLLAMA_HOST: ollamaHost }),
  });
  child.unref();
  return child;
}

function startOllamaPull(command, modelName, url = DEFAULT_OLLAMA_URL) {
  const ollamaHost = getOllamaHostEnv(url);
  const child = spawn(command, ["pull", modelName], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: spawnEnv({ OLLAMA_HOST: ollamaHost }),
  });
  child.unref();
  return child;
}

async function installOllamaWithWinget() {
  const winget = await resolveWingetCommand();
  if (!winget.ok) return { ok: false, error: winget.error || "winget not available" };
  try {
    await runBufferedCommand(winget.command, [
      "install",
      "--id",
      OLLAMA_INSTALL_ID,
      "-e",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ], { timeoutMs: 20 * 60 * 1000 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function formatLogDetails(details) {
  if (!details) return "";
  if (details instanceof Error) return details.stack || details.message;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function getLogPath() {
  try {
    const baseDir = app.getPath("userData");
    return path.join(baseDir, LOG_FILE_NAME);
  } catch {
    return path.join(process.cwd(), LOG_FILE_NAME);
  }
}

function logEvent(level, message, details) {
  const suffix = details ? ` ${formatLogDetails(details)}` : "";
  const line = `[${new Date().toISOString()}] [${level}] ${message}${suffix}\n`;
  try {
    fsSync.appendFileSync(getLogPath(), line, "utf8");
  } catch {
    // ignore logging failures
  }
}

process.on("uncaughtException", (error) => {
  logEvent("error", "uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  logEvent("error", "unhandledRejection", reason);
});

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

function buildSchemaHint(schema) {
  if (!schema) return "";
  return `\n\nReturn ONLY valid JSON. Match this schema as closely as possible:\n${JSON.stringify(schema, null, 2)}`;
}

function extractJson(text) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return text;

    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return text;
    }
  }
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
    localBackend: ai.localBackend || "llama_cpp",
    ollamaUrl: normalizeOllamaUrl(ai.ollamaUrl),
    ollamaModel: ai.ollamaModel || DEFAULT_OLLAMA_MODEL,
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
  logEvent("info", "createWindow");
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

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logEvent("error", "did-fail-load", {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logEvent("error", "render-process-gone", details);
  });

  mainWindow.on("unresponsive", () => {
    logEvent("warn", "window-unresponsive");
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
    logEvent("info", "loadURL", { url: devServerUrl });
    mainWindow.loadURL(devServerUrl).catch((error) => logEvent("error", "loadURL failed", error));
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = path.join(app.getAppPath(), "dist", "index.html");
    logEvent("info", "loadFile", { indexPath });
    mainWindow.loadFile(indexPath).catch((error) => logEvent("error", "loadFile failed", error));
  }

  mainWindow.on("closed", () => {
    logEvent("info", "window-closed");
    mainWindow = null;
  });
}

function runtimeForRenderer() {
  const budget = getCloudBudgetState();
  const safetyLimits = normalizeSafetyLimits(appConfig.ai || {});
  const cloudProvider = appConfig.ai?.cloudProvider || "google";
  const backendConfig = getLocalBackendConfig();
  return {
    ...localAiRuntime,
    aiMode: appConfig.ai?.mode || "disabled",
    localModelConsent: Boolean(appConfig.ai?.localModelConsent),
    localBackend: backendConfig.localBackend,
    ollamaUrl: backendConfig.ollamaUrl,
    ollamaModel: backendConfig.ollamaModel,
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

  if (mode === "local") {
    const { localBackend, ollamaUrl, ollamaModel } = getLocalBackendConfig();
    const currentProvider = localAiRuntime?.provider;
    const isBusy = ["starting", "downloading-model"].includes(localAiRuntime?.status);

    if (currentProvider && currentProvider !== localBackend) {
      stopLocalRuntime();
    }

    if (localBackend === "ollama") {
      if (currentProvider === "ollama" && isBusy && localAiPromise) {
        return localAiRuntime;
      }

      const serverReady = await isOllamaServerReady(ollamaUrl);
      if (serverReady) {
        const modelReady = await hasOllamaModel(ollamaUrl, ollamaModel);
        if (!modelReady) {
          if (appConfig.ai?.localModelConsent) {
            const status = await resolveOllamaCommand();
            if (status.ok) {
              logEvent("info", "ollama-pull-start", { model: ollamaModel, url: ollamaUrl });
              startOllamaPull(status.command, ollamaModel, ollamaUrl);
              localAiRuntime = {
                ...getHardwarePreset(),
                mode: "local",
                provider: "ollama",
                status: "downloading-model",
                error: null,
                url: ollamaUrl,
                model: ollamaModel,
              };
              localAiPromise = waitForOllamaRuntime(ollamaUrl, ollamaModel)
                .then(() => {
                  localAiRuntime = {
                    ...getHardwarePreset(),
                    mode: "local",
                    provider: "ollama",
                    status: "ready",
                    error: null,
                    url: ollamaUrl,
                    model: ollamaModel,
                  };
                  return localAiRuntime;
                })
                .catch((error) => {
                  localAiRuntime = {
                    ...getHardwarePreset(),
                    mode: "local",
                    provider: "ollama",
                    status: "error",
                    error: error.message || String(error),
                    url: ollamaUrl,
                    model: ollamaModel,
                  };
                  return localAiRuntime;
                });
              return localAiRuntime;
            }
          }

          localAiPromise = null;
          localAiRuntime = {
            ...getHardwarePreset(),
            mode: "local",
            provider: "ollama",
            status: "missing_model",
            error: `Ollama model ${ollamaModel} is not available.`,
            url: ollamaUrl,
            model: ollamaModel,
          };
          logEvent("warn", "ollama-model-missing", { url: ollamaUrl, model: ollamaModel });
          return localAiRuntime;
        }

        localAiPromise = null;
        localAiRuntime = {
          ...getHardwarePreset(),
          mode: "local",
          provider: "ollama",
          status: "ready",
          error: null,
          url: ollamaUrl,
          model: ollamaModel,
        };
        logEvent("info", "ollama-runtime-ready", { url: ollamaUrl, model: ollamaModel });
        return localAiRuntime;
      }

      if (appConfig.ai?.localModelConsent) {
        const status = await resolveOllamaCommand();
        if (status.ok) {
          logEvent("info", "ollama-serve-start", { url: ollamaUrl, model: ollamaModel });
          startOllamaServer(status.command, ollamaUrl);
          localAiRuntime = {
            ...getHardwarePreset(),
            mode: "local",
            provider: "ollama",
            status: "starting",
            error: null,
            url: ollamaUrl,
            model: ollamaModel,
          };
          localAiPromise = waitForOllamaRuntime(ollamaUrl)
            .then(async () => {
              const modelReady = await hasOllamaModel(ollamaUrl, ollamaModel);
              if (modelReady) {
                return;
              }
              logEvent("info", "ollama-pull-start", { model: ollamaModel, url: ollamaUrl });
              startOllamaPull(status.command, ollamaModel, ollamaUrl);
              localAiRuntime = {
                ...getHardwarePreset(),
                mode: "local",
                provider: "ollama",
                status: "downloading-model",
                error: null,
                url: ollamaUrl,
                model: ollamaModel,
              };
              await waitForOllamaRuntime(ollamaUrl, ollamaModel);
            })
            .then(() => {
              localAiRuntime = {
                ...getHardwarePreset(),
                mode: "local",
                provider: "ollama",
                status: "ready",
                error: null,
                url: ollamaUrl,
                model: ollamaModel,
              };
              return localAiRuntime;
            })
            .catch((error) => {
              localAiRuntime = {
                ...getHardwarePreset(),
                mode: "local",
                provider: "ollama",
                status: "error",
                error: error.message || String(error),
                url: ollamaUrl,
                model: ollamaModel,
              };
              return localAiRuntime;
            });
          return localAiRuntime;
        }
      }

      localAiPromise = null;
      localAiRuntime = {
        ...getHardwarePreset(),
        mode: "local",
        provider: "ollama",
        status: "missing_provider",
        error: "Ollama is not installed or running.",
        url: ollamaUrl,
        model: ollamaModel,
      };
      logEvent("warn", "ollama-missing-provider", { url: ollamaUrl, model: ollamaModel });
      return localAiRuntime;
    }

    const localUrl = currentProvider === "llama_cpp" && localAiRuntime.url
      ? localAiRuntime.url
      : "http://127.0.0.1:8080";
    const localModel = currentProvider === "llama_cpp" && localAiRuntime.model
      ? localAiRuntime.model
      : `${getHardwarePreset().repo}:${getHardwarePreset().quant}`;
    if (currentProvider === "llama_cpp" && isBusy && localAiPromise) {
      return localAiRuntime;
    }

    const serverReady = await isLocalAiServerReady(localUrl);
    if (serverReady) {
      localAiPromise = null;
      localAiRuntime = {
        ...getHardwarePreset(),
        mode: "local",
        provider: "llama_cpp",
        status: "ready",
        error: null,
        url: localUrl,
        model: localModel,
      };
      logEvent("info", "local-runtime-ready", {
        provider: "llama_cpp",
        url: localUrl,
        model: localModel,
      });
      return localAiRuntime;
    }

    if (appConfig.ai?.localModelConsent) {
      localAiRuntime = {
        ...localAiRuntime,
        mode: "local",
        provider: "llama_cpp",
        status: "downloading-model",
        error: null,
        url: localUrl,
        model: localModel,
      };

      localAiPromise = startLocalAi(app)
        .then((runtime) => {
          localAiRuntime = {
            ...runtime,
            mode: "local",
            provider: "llama_cpp",
            status: runtime.status || "ready",
            error: null,
          };
          logEvent("info", "local-runtime-ready", {
            provider: "llama_cpp",
            url: runtime.url,
            model: runtime.model,
          });
          return localAiRuntime;
        })
        .catch((error) => {
          localAiRuntime = {
            ...localAiRuntime,
            mode: "local",
            provider: "llama_cpp",
            status: "error",
            error: error.message || String(error),
          };
          logEvent("error", "local-runtime-failed", error);
          return localAiRuntime;
        });

      return localAiPromise;
    }

    localAiPromise = null;
    localAiRuntime = {
      ...getHardwarePreset(),
      mode: "local",
      provider: "llama_cpp",
      status: "disabled",
      error: "Local AI requires consent to download and install the Gemma runtime.",
      url: localUrl,
      model: `${getHardwarePreset().repo}:${getHardwarePreset().quant}`,
    };
    logEvent("warn", "local-runtime-disabled", { url: localUrl });
    return localAiRuntime;
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

async function promptForAiSetup(parentWindow) {
  const options = {
    type: "question",
    buttons: [
      "Use Codex CLI",
      "Use Ollama",
      "Download local Gemma model",
      "Not now",
    ],
    defaultId: 0,
    cancelId: 3,
    title: "StudyBridge AI setup",
    message: "Choose how you want AI to work in StudyBridge.",
    detail: "Codex CLI uses your local Codex login and does not store an OpenAI API key in this app. Ollama uses your local Ollama install. Local Gemma remains available for offline use.",
    noLink: true,
  };

  const response = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);

  return response.response;
}

async function initializeAiMode(parentWindow) {
  appConfig = await readConfig(app);
  let shouldPersist = false;

  if (!appConfig.ai) {
    appConfig.ai = {};
    shouldPersist = true;
  }

  const normalizedOllamaUrl = normalizeOllamaUrl(appConfig.ai.ollamaUrl);
  if (appConfig.ai.ollamaUrl !== normalizedOllamaUrl) {
    appConfig.ai.ollamaUrl = normalizedOllamaUrl;
    shouldPersist = true;
  }
  if (!appConfig.ai.ollamaModel) {
    appConfig.ai.ollamaModel = DEFAULT_OLLAMA_MODEL;
    shouldPersist = true;
  }
  if (appConfig.ai.mode === "local" && !appConfig.ai.localModelConsent) {
    appConfig.ai.localModelConsent = true;
    shouldPersist = true;
  }

  if (shouldPersist) {
    appConfig = await writeConfig(app, appConfig);
  }

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
    const choice = await promptForAiSetup(parentWindow);
    if (choice === 0) {
      appConfig.ai.mode = "codex";
      appConfig.ai.agentProvider = "none";
    } else if (choice === 1) {
      appConfig.ai.mode = "local";
      appConfig.ai.localBackend = "ollama";
      appConfig.ai.localModelConsent = true;
    } else if (choice === 2) {
      appConfig.ai.mode = "local";
      appConfig.ai.localBackend = "llama_cpp";
      appConfig.ai.localModelConsent = true;
    } else {
      appConfig.ai.mode = "disabled";
    }

    appConfig = await writeConfig(app, appConfig);
  }

  await syncRuntimeFromConfig();
}

async function ensureLocalAiInstall(parentWindow) {
  const setup = appConfig.setup || {};
  const { localBackend, ollamaUrl, ollamaModel } = getLocalBackendConfig();
  const setupKey = getLocalSetupFlag(localBackend);
  if (setup[setupKey]) return;

  if (localBackend === "ollama") {
    const serverReady = await isOllamaServerReady(ollamaUrl);
    if (serverReady && await hasOllamaModel(ollamaUrl, ollamaModel)) {
      appConfig = await writeConfig(app, {
        ...appConfig,
        ai: {
          ...appConfig.ai,
          mode: appConfig.ai?.mode === "ask" || appConfig.ai?.mode === "disabled" ? "local" : appConfig.ai?.mode,
        },
        setup: {
          ...setup,
          [setupKey]: true,
        },
      });
      await syncRuntimeFromConfig();
      return;
    }
  } else {
    const cached = await getCachedLlamaBinary(app);
    if (cached) {
      appConfig = await writeConfig(app, {
        ...appConfig,
        setup: {
          ...setup,
          [setupKey]: true,
        },
      });
      return;
    }
  }

  const installLabel = localBackend === "ollama" ? "Ollama" : "local AI";
  const installDetail = localBackend === "ollama"
    ? "This uses your configured Ollama runtime and Gemma model, then marks the setup as complete once the server and model are ready."
    : "This downloads llama.cpp and the recommended Gemma model to a standard location under your user profile.";

  const options = {
    type: "question",
    buttons: [`Install ${installLabel}`, "Not now"],
    defaultId: 0,
    cancelId: 1,
    title: `Install ${installLabel}`,
    message: `StudyBridge can install the ${installLabel} runtime in the background.`,
    detail: installDetail,
    noLink: true,
  };

  const response = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);

  if (response.response === 0) {
    appConfig = await writeConfig(app, {
      ...appConfig,
      ai: {
        ...appConfig.ai,
        mode: "local",
        localBackend,
        localModelConsent: true,
      },
      setup: {
        ...setup,
        [setupKey]: true,
      },
    });

    logEvent("info", "local-ai-install-started", { localBackend });
    syncRuntimeFromConfig().catch((error) => logEvent("error", "syncRuntimeFromConfig failed", error));
    return;
  }

  appConfig = await writeConfig(app, {
    ...appConfig,
    setup: {
      ...setup,
      [setupKey]: true,
    },
  });
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

  if (next.mode === "local") {
    next.localModelConsent = true;
  }

  next.ollamaUrl = normalizeOllamaUrl(next.ollamaUrl);
  next.ollamaModel = next.ollamaModel || DEFAULT_OLLAMA_MODEL;

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
async function invokeLocalProvider(payload = {}) {
  const { localBackend, ollamaUrl, ollamaModel } = getLocalBackendConfig();
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const responseJsonSchema = payload.response_json_schema || null;
  const explicitModel = typeof payload.model === "string" && payload.model.trim()
    ? payload.model.trim()
    : "";
  const runtimeProvider = localAiRuntime?.provider === localBackend
    ? localAiRuntime.provider
    : localBackend;
  const preset = getHardwarePreset();
  const model = explicitModel || (runtimeProvider === "ollama"
    ? ollamaModel
    : (localAiRuntime?.provider === "llama_cpp" && localAiRuntime?.model) || `${preset.repo}:${preset.quant}`);
  const url = runtimeProvider === "ollama"
    ? ollamaUrl
    : (localAiRuntime?.provider === "llama_cpp" && localAiRuntime?.url) || "http://127.0.0.1:8080";

  if (!prompt.trim()) {
    throw new Error("Prompt is empty.");
  }

  if (localAiPromise) {
    try {
      await localAiPromise;
    } catch {
      // keep the current runtime state; the caller will surface the failure if needed
    }
  }

  if (["disabled", "error", "missing_provider", "missing_model", "starting", "downloading-model"].includes(localAiRuntime?.status)) {
    const error = new Error(localAiRuntime.error || "Local AI is not ready. Open Settings to check the runtime.");
    error.code = "AI_UNAVAILABLE";
    throw error;
  }

  const response = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content: "You are StudyBridge's local tutor. Help students learn clearly, avoid hallucinating, and return valid JSON whenever a JSON schema is requested.",
        },
        {
          role: "user",
          content: `${prompt}${buildSchemaHint(responseJsonSchema)}`,
        },
      ],
      temperature: responseJsonSchema ? 0.15 : 0.35,
      top_p: 0.9,
      max_tokens: responseJsonSchema ? 2048 : 1024,
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const error = new Error(`Local AI request failed: ${response.status} ${rawText}`);
    error.code = "AI_REQUEST_FAILED";
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const parseError = new Error(`Local AI returned invalid JSON: ${error.message}`);
    parseError.code = "AI_REQUEST_FAILED";
    throw parseError;
  }

  const text = parsed?.choices?.[0]?.message?.content || "";
  if (!responseJsonSchema) {
    return text;
  }

  return extractJson(text);
}
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

  return extractJson(text);
}
ipcMain.handle("studybridge:invoke-local-provider", async (_event, payload = {}) => invokeLocalProvider(payload));
ipcMain.handle("studybridge:invoke-cloud-provider", async (_event, payload = {}) => invokeCloudProvider(payload));
ipcMain.handle("studybridge:invoke-google-gemini", async (_event, payload = {}) => invokeCloudProvider({ ...payload, provider: "google" }));
ipcMain.handle("studybridge:install-ollama", async () => {
  const result = await installOllamaWithWinget();
  if (result?.ok) {
    try {
      await syncRuntimeFromConfig();
    } catch (error) {
      logEvent("error", "syncRuntimeFromConfig failed", error);
    }
  }
  return result;
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
    createWindow();
    try {
      await initializeAiMode(mainWindow);
      if (appConfig.ai?.mode !== "local") {
        await ensureLocalAiInstall(mainWindow);
      }
    } catch (error) {
      logEvent("error", "initializeAiMode failed", error);
      dialog.showErrorBox("StudyBridge startup error", error?.message || String(error));
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch((error) => {
    logEvent("error", "app.whenReady failed", error);
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
