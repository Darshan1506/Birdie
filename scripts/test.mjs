// Runs every tests/*.test.ts. Node 20 can't expand globs itself and npm's shell differs per OS,
// so the file list is built here.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const files = readdirSync("tests")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
