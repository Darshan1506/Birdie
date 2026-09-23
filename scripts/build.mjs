// Bundles the TypeScript into dist/, which is the folder you load unpacked in Chrome/Edge.
//   node scripts/build.mjs           one-off production build
//   node scripts/build.mjs --watch   rebuild on every change
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

const options = {
  entryPoints: {
    content: "src/content/index.ts",
    background: "src/background/index.ts",
    options: "src/options/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife", // content scripts can't be ES modules, so everything is bundled into one file each
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  minify: false, // readable output makes store review and debugging easier
  logLevel: "info",
};

// The manifest's version comes from package.json, so there is one place to bump it.
async function copyStatic() {
  const manifest = JSON.parse(await readFile("static/manifest.json", "utf8"));
  manifest.version = pkg.version;
  await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  await cp("static/options.html", "dist/options.html");
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await copyStatic();

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching src/ … reload the extension after each rebuild.");
} else {
  await build(options);
}
