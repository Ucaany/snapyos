import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const nextDirectory = path.join(projectRoot, ".next");
const standaloneDirectory = path.join(nextDirectory, "standalone");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function copyDirectory(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

const serverPath = path.join(standaloneDirectory, "server.js");
if (!(await exists(serverPath))) {
  throw new Error(`Next standalone server tidak ditemukan: ${serverPath}`);
}

await copyDirectory(
  path.join(nextDirectory, "static"),
  path.join(standaloneDirectory, ".next", "static")
);

const standalonePublicDirectory = path.join(standaloneDirectory, "public");
await rm(standalonePublicDirectory, { recursive: true, force: true });

const publicDirectory = path.join(projectRoot, "public");
if (await exists(publicDirectory)) {
  await copyDirectory(publicDirectory, standalonePublicDirectory);
}

console.log("Standalone assets prepared: .next/static and public");
