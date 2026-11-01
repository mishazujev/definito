import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(project, ".output", "public");
const distDir = path.join(project, "dist");
const workerSource = path.join(project, "worker", "index.js");

if (!existsSync(path.join(publicDir, "index.html"))) {
  throw new Error("Static SPA build is missing .output/public/index.html.");
}
if (!existsSync(workerSource)) throw new Error("Worker source is missing.");

function collectFiles(directory, prefix = "") {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Build assets cannot contain symlinks: ${relative}`);
    if (stat.isDirectory()) files.push(...collectFiles(absolute, relative));
    else if (stat.isFile()) files.push({ absolute, relative });
    else throw new Error(`Unsupported build asset: ${relative}`);
  }
  return files;
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const assets = Object.fromEntries(collectFiles(publicDir).map(({ absolute, relative }) => {
  const extension = path.extname(relative).toLowerCase();
  return [`/${relative}`, {
    type: mimeTypes[extension] ?? "application/octet-stream",
    body: readFileSync(absolute).toString("base64"),
  }];
}));

rmSync(distDir, { recursive: true, force: true });
mkdirSync(path.join(distDir, "server"), { recursive: true });
cpSync(workerSource, path.join(distDir, "server", "index.js"));
writeFileSync(
  path.join(distDir, "server", "assets.js"),
  `export default ${JSON.stringify(assets)};\n`,
);
console.log(`Packaged ${Object.keys(assets).length} public assets into the Site Worker.`);
