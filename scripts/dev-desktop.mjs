import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const projectRoot = process.cwd();
const nodeCommand = process.execPath;
const viteBinary = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const electronBinary = process.platform === "win32"
  ? path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
  : path.join(projectRoot, "node_modules", "electron", "dist", "electron");
const devServerUrl = "http://127.0.0.1:5173";

function spawnProcess(command, args, options = {}) {
  const env = {
    ...process.env,
    ...(options.env || {}),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
    env,
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep waiting
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const viteProcess = spawnProcess(nodeCommand, [viteBinary, "dev", "--host", "127.0.0.1", "--port", "5173"]);
let electronProcess = null;

const stop = () => {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill();
  }
};

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

viteProcess.on("exit", (code) => {
  if (code && code !== 0) {
    stop();
    process.exit(code);
  }
});

await waitForServer(devServerUrl);

electronProcess = spawnProcess(electronBinary, [path.join(projectRoot, "electron", "main.cjs")], {
  env: {
    ...process.env,
    ELECTRON_START_URL: devServerUrl,
  },
});

electronProcess.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
