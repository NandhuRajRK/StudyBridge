const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");

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

function createAgentEnv(env = {}) {
  const childEnv = {
    ...process.env,
    ...env,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const pathKey = getPathKey(childEnv);
  const pathEntries = (childEnv[pathKey] || "").split(path.delimiter);
  childEnv[pathKey] = unique([...pathEntries, ...getCommonCliDirs(childEnv)]).join(path.delimiter);
  return childEnv;
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
  const env = createAgentEnv();
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
      const { stdout, stderr } = await runCommand(command, ["--version"], { timeoutMs: 15000 });
      return { ok: true, command, version: stdout.trim() || stderr.trim() };
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

function runCommand(command, args, { cwd, input, timeoutMs = 10 * 60 * 1000, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: shouldUseWindowsShell(command),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: createAgentEnv(env),
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error(`Agent command timed out after ${Math.round(timeoutMs / 1000)}s.`));
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
      reject(error);
    });

    child.on("exit", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `Command exited with code ${code}`));
      }
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function extractJson(text) {
  if (!text || typeof text !== "string") return text;
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

function buildSchemaHint(schema) {
  if (!schema) return "";
  return `\n\nReturn ONLY valid JSON. Match this schema as closely as possible:\n${JSON.stringify(schema, null, 2)}`;
}

function parseCodexJsonStream(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let lastText = "";

  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      if (typeof item?.result === "string" && item.result.trim()) {
        lastText = item.result.trim();
      }
      if (typeof item?.msg?.text === "string" && item.msg.text.trim()) {
        lastText = item.msg.text.trim();
      }
      if (typeof item?.text === "string" && item.text.trim()) {
        lastText = item.text.trim();
      }
    } catch {
      lastText = `${lastText}\n${line}`.trim();
    }
  }

  return lastText.trim() || stdout.trim();
}

function getProviderCommand(provider) {
  if (provider === "claude-code") {
    return { command: "claude", availableArgs: ["--version"], authCommand: "claude" };
  }
  if (provider === "codex-cli") {
    return {
      command: "codex",
      availableArgs: ["--version"],
      authCommand: "codex login",
    };
  }
  if (provider === "opencode-cli") {
    return { command: "opencode", availableArgs: ["--version"], authCommand: "opencode auth login" };
  }
  if (provider === "gemini-cli") {
    return { command: "gemini", availableArgs: ["--version"], authCommand: "gemini" };
  }
  return null;
}

async function detectAgentProvider(provider) {
  const descriptor = getProviderCommand(provider);
  if (!descriptor) {
    return { provider, status: "unsupported", error: "Unsupported provider." };
  }

  try {
    if (provider === "codex-cli") {
      const resolved = await resolveCodexCommand();
      if (!resolved.ok) {
        throw new Error(resolved.error);
      }
      return { provider, status: "ready", error: null, command: resolved.command, version: resolved.version };
    }

    await runCommand(descriptor.command, descriptor.availableArgs, { timeoutMs: 15000 });
    return { provider, status: "ready", error: null };
  } catch (error) {
    return {
      provider,
      status: "missing",
      error: `${descriptor.command} is not available on PATH or failed to start.`,
      details: error.message || String(error),
    };
  }
}

async function preparePromptWorkspace(baseDir, prompt, response_json_schema) {
  await fs.mkdir(baseDir, { recursive: true });
  const promptPath = path.join(baseDir, "prompt.md");
  const promptBody = `${prompt}${buildSchemaHint(response_json_schema)}\n`;
  await fs.writeFile(promptPath, promptBody, "utf8");
  return promptPath;
}

async function writeOpenCodeConfig(baseDir, { baseUrl }) {
  const configPath = path.join(baseDir, "opencode.json");
  const config = {
    $schema: "https://opencode.ai/config.json",
    enabled_providers: ["studybridge-local"],
    provider: {
      "studybridge-local": {
        npm: "@ai-sdk/openai-compatible",
        name: "StudyBridge Local Gemma",
        options: {
          baseURL: baseUrl,
        },
        models: {
          "gemma-local": {
            name: "Gemma local",
          },
        },
      },
    },
    model: "studybridge-local/gemma-local",
    small_model: "studybridge-local/gemma-local",
  };
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return configPath;
}

async function invokeAgentProvider(provider, { prompt, response_json_schema, cwd, model }) {
  if (!provider) {
    throw new Error("No external agent provider selected.");
  }

  const workspaceDir = cwd;
  await preparePromptWorkspace(workspaceDir, prompt, response_json_schema);
  const userPrompt = "Read prompt.md in the current directory and answer exactly as instructed.";

  if (provider === "claude-code") {
    const { stdout } = await runCommand(
      "claude",
      [
        "-p",
        userPrompt,
        "--output-format",
        response_json_schema ? "json" : "text",
        "--cwd",
        workspaceDir,
      ],
      { cwd: workspaceDir, timeoutMs: 20 * 60 * 1000 },
    );

    const parsed = extractJson(stdout);
    const text = typeof parsed === "object" && parsed
      ? (parsed.result || parsed.content || parsed.text || stdout)
      : stdout;

    return response_json_schema ? extractJson(text) : text;
  }

  if (provider === "codex-cli") {
    const resolved = await resolveCodexCommand();
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    const { stdout } = await runCommand(
      resolved.command,
      [
        "exec",
        "-m",
        "gpt-5.1-codex-mini",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "-",
      ],
      {
        cwd: workspaceDir,
        timeoutMs: 20 * 60 * 1000,
        input: `${prompt}${buildSchemaHint(response_json_schema)}\n`,
      },
    );

    const text = stdout.trim();
    return response_json_schema ? extractJson(text) : text;
  }

  if (provider === "opencode-cli") {
    const baseUrl = process.env.VITE_LLAMACPP_URL || "http://127.0.0.1:8080/v1";
    await writeOpenCodeConfig(workspaceDir, { baseUrl });
    const { stdout } = await runCommand(
      "opencode",
      [
        "run",
        "--format",
        "json",
        "--file",
        "prompt.md",
        userPrompt,
      ],
      {
        cwd: workspaceDir,
        timeoutMs: 20 * 60 * 1000,
        input: "",
        env: {
          OPENCODE_CONFIG: path.join(workspaceDir, "opencode.json"),
        },
      },
    );

    const text = parseCodexJsonStream(stdout);
    return response_json_schema ? extractJson(text) : text;
  }

  if (provider === "gemini-cli") {
    const args = [
      "-p",
      userPrompt,
    ];

    if (typeof model === "string" && model.trim()) {
      args.unshift(model.trim());
      args.unshift("-m");
    }

    const { stdout } = await runCommand(
      "gemini",
      args,
      {
        cwd: workspaceDir,
        timeoutMs: 20 * 60 * 1000,
      },
    );

    const text = parseCodexJsonStream(stdout) || stdout.trim();
    return response_json_schema ? extractJson(text) : text;
  }

  throw new Error(`Unsupported external agent provider: ${provider}`);
}

async function installAgentProvider(provider) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  let packageName = "";
  if (provider === "claude-code") packageName = "@anthropic-ai/claude-code";
  if (provider === "codex-cli") packageName = "@openai/codex";
  if (provider === "opencode-cli") packageName = "opencode-ai";
  if (provider === "gemini-cli") packageName = "@google/gemini-cli";

  if (!packageName) {
    throw new Error("Unsupported provider install request.");
  }

  return runCommand(npmCommand, ["install", "-g", packageName], {
    timeoutMs: 20 * 60 * 1000,
  });
}

function getAgentProviderAuthCommand(provider) {
  return getProviderCommand(provider)?.authCommand || "";
}

function getAgentProviderInstallCommand(provider) {
  if (provider === "claude-code") return "npm install -g @anthropic-ai/claude-code";
  if (provider === "codex-cli") {
    if (process.platform === "win32") {
      return 'npm install -g @openai/codex && "%APPDATA%\\npm\\codex.cmd" login';
    }
    return "npm install -g @openai/codex && codex login";
  }
  if (provider === "opencode-cli") return "npm install -g opencode-ai";
  if (provider === "gemini-cli") return "npm install -g @google/gemini-cli";
  return "";
}

module.exports = {
  detectAgentProvider,
  invokeAgentProvider,
  installAgentProvider,
  getAgentProviderAuthCommand,
  getAgentProviderInstallCommand,
};
