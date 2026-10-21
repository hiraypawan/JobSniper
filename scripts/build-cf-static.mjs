import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Builds static Next.js export (`out/`) cleanly for Cloudflare Pages / Workers Static Assets
// while temporarily stashing local Node dev `/app/api` route handlers so `output: "export"` succeeds.
const root = process.cwd();
const apiDir = path.join(root, "app", "api");
const stashDir = path.join(root, ".api-stash");

const hadApi = fs.existsSync(apiDir);
if (hadApi) {
  if (fs.existsSync(stashDir)) {
    fs.rmSync(stashDir, { recursive: true, force: true });
  }
  fs.renameSync(apiDir, stashDir);
}

try {
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1" },
  });
  console.log("✓ Static export generated in ./out ready for Cloudflare deploy.");
} finally {
  if (hadApi && fs.existsSync(stashDir)) {
    fs.renameSync(stashDir, apiDir);
  }
}
