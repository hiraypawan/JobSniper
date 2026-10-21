#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exit(0);
}

const env = { ...process.env };
const linuxCaBundle = "/etc/ssl/certs/ca-certificates.crt";
if (!env.NODE_EXTRA_CA_CERTS && fs.existsSync(linuxCaBundle)) {
  env.NODE_EXTRA_CA_CERTS = linuxCaBundle;
}
env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --no-warnings`.trim();

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
