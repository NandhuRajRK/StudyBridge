import { spawn } from "node:child_process";
import { build as electronBuild } from "electron-builder";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
await run(npmCommand, ["run", "build"]);
await electronBuild({ publish: "never" });
