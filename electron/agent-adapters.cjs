const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

function runCommand(command, args, { cwd, input, timeoutMs = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
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
    return { command: "claude", availableArgs: ["--version"] };
  }
  if (provider === "codex-cli") {
    return { command: "codex", availableArgs: ["--version"] };
  }
  return null;
}

async function detectAgentProvider(provider) {
  const descriptor = getProviderCommand(provider);
  if (!descriptor) {
    return { provider, status: "unsupported", error: "Unsupported provider." };
  }

  try {
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

async function invokeAgentProvider(provider, { prompt, response_json_schema, cwd }) {
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
    const { stdout } = await runCommand(
      "codex",
      [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "--full-auto",
        userPrompt,
      ],
      { cwd: workspaceDir, timeoutMs: 20 * 60 * 1000 },
    );

    const text = parseCodexJsonStream(stdout);
    return response_json_schema ? extractJson(text) : text;
  }

  throw new Error(`Unsupported external agent provider: ${provider}`);
}

module.exports = {
  detectAgentProvider,
  invokeAgentProvider,
};
