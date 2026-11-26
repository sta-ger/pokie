#!/usr/bin/env node
import {existsSync} from "node:fs";
import path from "node:path";
import {spawn, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

// A small double-click/one-command launcher for a checkout. The shell/PowerShell wrapper provisions a
// pinned portable Node when the host has none; this script assumes Node is running, checks its version,
// installs/builds on first use and then runs the same CLI a developer would run. Nothing here publishes,
// deploys or changes a game design.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli", "pokie.js");
const nodeModules = path.join(root, "node_modules");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
    console.error(`POKIE Studio needs Node 22.12 or newer. This is Node ${process.versions.node}.`);
    console.error("Install the current Node.js LTS from https://nodejs.org/ and run this launcher again.");
    process.exit(1);
}

const nodeBinDir = path.dirname(process.execPath);
const bundledNpm = path.join(nodeBinDir, process.platform === "win32" ? "npm.cmd" : "npm");
const childPath = `${nodeBinDir}${path.delimiter}${process.env.PATH ?? ""}`;

function npm(args) {
    // Prefer the npm that ships beside the Node running this script. A portable runtime may be the
    // only Node on the machine, and its bin directory is not automatically on PATH.
    const command = existsSync(bundledNpm) ? bundledNpm : process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(command, args, {cwd: root, stdio: "inherit", shell: process.platform === "win32", env: {...process.env, PATH: childPath}});
    if (result.error !== undefined) {
        console.error(`Could not run npm: ${result.error.message}`);
        console.error("Install Node.js (which includes npm) from https://nodejs.org/ and try again.");
        process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(nodeModules)) {
    console.log("First run: installing POKIE's dependencies. This can take a few minutes.");
    npm(["install"]);
}
if (!existsSync(cli)) {
    console.log("First run: building the local Studio. This can take a few minutes.");
    npm(["run", "build-cli"]);
}

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {cwd: root, stdio: "inherit", env: {...process.env, PATH: childPath}});
const forward = (signal) => {
    if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("exit", (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
});
