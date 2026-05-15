const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const RELEASES_URL = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest";
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 8080;

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function getHardwarePreset() {
  const totalMemoryGb = os.totalmem() / (1024 ** 3);

  if (totalMemoryGb >= 32) {
    return {
      label: "Gemma 4 31B",
      repo: "ggml-org/gemma-4-31B-it-GGUF",
      quant: "Q4_K_M",
      context: 4096,
      minMemoryGb: 32,
    };
  }

  if (totalMemoryGb >= 24) {
    return {
      label: "Gemma 4 26B A4B",
      repo: "ggml-org/gemma-4-26B-A4B-it-GGUF",
      quant: "Q4_K_M",
      context: 4096,
      minMemoryGb: 24,
    };
  }

  if (totalMemoryGb >= 12) {
    return {
      label: "Gemma 4 E4B",
      repo: "ggml-org/gemma-4-E4B-it-GGUF",
      quant: "Q4_K_M",
      context: 6144,
      minMemoryGb: 12,
    };
  }

  return {
    label: "Gemma 4 E2B",
    repo: "ggml-org/gemma-4-E2B-it-GGUF",
    quant: "Q8_0",
    context: 4096,
    minMemoryGb: 0,
  };
}

async function fetchLatestRelease() {
  const response = await fetch(RELEASES_URL, {
    headers: {
      "User-Agent": "StudyBridge",
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to query llama.cpp releases: ${response.status}`);
  }

  return response.json();
}

function pickBinaryAsset(assets) {
  const patterns = process.arch === "arm64"
    ? [
        /llama-.*bin-win-arm64\.zip$/i,
        /cudart-llama-bin-win-cuda-.*-arm64\.zip$/i,
      ]
    : [
        /llama-.*bin-win-avx2-x64\.zip$/i,
        /llama-.*bin-win-cpu-x64\.zip$/i,
      ];

  return assets.find((asset) => patterns.some((pattern) => pattern.test(asset.name)));
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "StudyBridge",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destinationPath, buffer);
}

async function expandArchive(zipPath, destinationDir) {
  await fs.mkdir(destinationDir, { recursive: true });

  const command = [
    "Expand-Archive",
    "-LiteralPath",
    shellQuote(zipPath),
    "-DestinationPath",
    shellQuote(destinationDir),
    "-Force",
  ].join(" ");

  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", command], {
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Expand-Archive failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function findFileRecursive(rootDir, fileName) {
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
    }
  }

  return null;
}

async function ensureLlamaBinary(app) {
  const preset = getHardwarePreset();
  const rootDir = path.join(app.getPath("userData"), "llama.cpp");
  const cacheDir = path.join(rootDir, "cache");
  const binariesDir = path.join(rootDir, "binaries");
  const manifestsDir = path.join(rootDir, "manifests");
  const manifestPath = path.join(manifestsDir, "binary.json");

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(binariesDir, { recursive: true });
  await fs.mkdir(manifestsDir, { recursive: true });

  try {
    const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (existing?.binaryPath) {
      try {
        await fs.access(existing.binaryPath);
        return { ...preset, binaryPath: existing.binaryPath };
      } catch {
        // fall through and refresh the binary
      }
    }
  } catch {
    // no cached manifest yet
  }

  const release = await fetchLatestRelease();
  const asset = pickBinaryAsset(release.assets || []);
  if (!asset) {
    throw new Error("Could not find a llama.cpp Windows binary in the latest release.");
  }

  const zipPath = path.join(cacheDir, asset.name);
  const extractDir = path.join(binariesDir, release.tag_name);

  await fs.mkdir(extractDir, { recursive: true });
  await downloadFile(asset.browser_download_url, zipPath);
  await expandArchive(zipPath, extractDir);

  const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const binaryPath = await findFileRecursive(extractDir, binaryName);

  if (!binaryPath) {
    throw new Error("Downloaded llama.cpp archive did not contain llama-server.");
  }

  await fs.writeFile(manifestPath, JSON.stringify({
    release: release.tag_name,
    asset: asset.name,
    binaryPath,
    preset,
  }, null, 2), "utf8");

  return { ...preset, binaryPath };
}

async function getCachedLlamaBinary(app) {
  const preset = getHardwarePreset();
  const rootDir = path.join(app.getPath("userData"), "llama.cpp");
  const manifestsDir = path.join(rootDir, "manifests");
  const manifestPath = path.join(manifestsDir, "binary.json");

  try {
    const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (!existing?.binaryPath) return null;
    await fs.access(existing.binaryPath);
    return { ...preset, binaryPath: existing.binaryPath, manifest: existing };
  } catch {
    return null;
  }
}

function waitForServer(url, timeoutMs = 20 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for llama.cpp to start"));
        return;
      }

      try {
        const response = await fetch(`${url}/v1/models`);
        if (response.ok) {
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

async function startLocalAi(app) {
  const runtime = {
    mode: "local",
    status: "starting",
    error: null,
    url: `http://${LOCAL_HOST}:${LOCAL_PORT}`,
    ...getHardwarePreset(),
  };

  const { binaryPath, repo, quant, context } = await ensureLlamaBinary(app);
  runtime.binaryPath = binaryPath;
  runtime.model = `${repo}:${quant}`;
  runtime.context = context;
  runtime.status = "downloading-model";

  const child = spawn(binaryPath, [
    "--host",
    LOCAL_HOST,
    "--port",
    String(LOCAL_PORT),
    "-hf",
    `${repo}:${quant}`,
    "-c",
    String(context),
  ], {
    stdio: "ignore",
    windowsHide: true,
  });

  child.unref();
  runtime.pid = child.pid;
  runtime.status = "starting";
  runtime.stop = () => {
    if (child && !child.killed) {
      child.kill();
    }
  };

  await waitForServer(runtime.url);
  runtime.status = "ready";

  app.on("before-quit", () => {
    runtime.stop?.();
  });

  return runtime;
}

module.exports = {
  startLocalAi,
  getHardwarePreset,
  getCachedLlamaBinary,
};
