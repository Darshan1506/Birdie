// Packages dist/ as voice-feed.zip (run `npm run build` first; `npm run zip` does both).
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

rmSync("voice-feed.zip", { force: true });
const r =
  process.platform === "win32"
    ? spawnSync("powershell", [
        "-NoProfile",
        "-Command",
        "Compress-Archive -Path dist/* -DestinationPath voice-feed.zip",
      ], { stdio: "inherit" })
    : spawnSync("zip", ["-r", "../voice-feed.zip", "."], { cwd: "dist", stdio: "inherit" });
process.exit(r.status ?? 1);
