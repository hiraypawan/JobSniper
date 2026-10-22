#!/usr/bin/env node
/**
 * Copy check.
 *
 * Fails if any source file contains an em dash or an en dash, or one of the
 * phrases that make text read like a model wrote it. Run this before pushing.
 * Characters are written as escapes here so this file stays clean too.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  ".data",
  ".wrangler",
  "dist",
  "build",
]);

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".css",
  ".md",
  ".yml",
  ".toml",
  ".sql",
  ".json",
]);

const DASHES = [
  { char: "\u2014", name: "em dash" },
  { char: "\u2013", name: "en dash" },
];

const BANNED = [
  "seamless",
  "effortless",
  "game changer",
  "game-changing",
  "cutting edge",
  "cutting-edge",
  "delve",
  "leverage",
  "supercharge",
  "unleash",
  "revolutionize",
  "state of the art",
  "in today's fast-paced",
  "it's not just",
  "10x",
];

const FILES_WITH_RULES = new Set(["lib/humanize.ts", "scripts/check-copy.mjs"]);

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      if (entry.name === "package-lock.json") continue;
      out.push(full);
    }
  }
  return out;
}

const problems = [];
const files = await walk(ROOT);

for (const file of files) {
  const rel = relative(ROOT, file);
  if (FILES_WITH_RULES.has(rel)) continue;
  if (rel.endsWith("README.md") && rel !== "README.md") continue;

  const text = await readFile(file, "utf8").catch(() => "");
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    for (const dash of DASHES) {
      if (line.includes(dash.char)) {
        problems.push(`${rel}:${index + 1} has an ${dash.name}`);
      }
    }
    const lower = line.toLowerCase();
    for (const phrase of BANNED) {
      if (lower.includes(phrase)) {
        problems.push(`${rel}:${index + 1} uses "${phrase}"`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`Copy check failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nRewrite the line instead of masking it.");
  process.exit(1);
}

console.log(`Copy check passed (${files.length} files scanned).`);
