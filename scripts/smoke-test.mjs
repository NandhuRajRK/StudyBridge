import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const packagePath = path.join(rootDir, "package.json");

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const requiredFiles = new Set([
  packageJson.main || "",
  "electron/preload.cjs",
  "public/studybridge.png",
  "src/main.jsx",
  "vite.config.js",
  "README.md",
  ".env.example",
]);

const missing = [...requiredFiles]
  .filter(Boolean)
  .filter((file) => !fs.existsSync(path.join(rootDir, file)));

if (missing.length) {
  console.error("Smoke test failed. Missing required files:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

try {
  await import("node:sqlite");
} catch (error) {
  console.error("Smoke test failed. node:sqlite is not available in this Node runtime.");
  console.error("Use Node 22+ or the Electron runtime that ships with node:sqlite.");
  if (error?.message) {
    console.error(`Detail: ${error.message}`);
  }
  process.exit(1);
}

console.log("Smoke test passed.");
