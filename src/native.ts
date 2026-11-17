import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DemoPlan } from "./schema.ts";
import type { Probe } from "./probe.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const SRC = join(ROOT, "mac/macdriver.swift");
const BIN = join(ROOT, "mac/.build/macdriver");

/** Compile the Swift helper if it's missing or older than its source. */
export function driver(): string {
  if (process.platform !== "darwin") throw new Error("Native app recording needs macOS.");
  if (!existsSync(BIN) || statSync(BIN).mtimeMs < statSync(SRC).mtimeMs) {
    console.log("  compiling mac/macdriver.swift …");
    mkdirSync(join(ROOT, "mac/.build"), { recursive: true });
    execFileSync("swiftc", ["-O", "-swift-version", "5", SRC, "-o", BIN], { stdio: "inherit" });
  }
  return BIN;
}

export type NativeOpts = { app: string; appArgs: string[]; seed?: string };

/**
 * A fresh, throwaway data dir for every run (so recordings are repeatable and never
 * touch real user data). "{data}" in --app-args is replaced with its path.
 */
function prepareData(out: string, o: NativeOpts): string[] {
  const data = join(out, "appdata");
  rmSync(data, { recursive: true, force: true });
  mkdirSync(data, { recursive: true });
  if (o.seed) cpSync(resolve(o.seed), statSync(o.seed).isDirectory() ? data : join(data, basename(o.seed)), { recursive: true });
  return o.appArgs.map((a) => a.replaceAll("{data}", data));
}

export function probeNative(out: string, o: NativeOpts): Probe {
  execFileSync(driver(), ["probe", "--app", resolve(o.app), "--out", out, "--", ...prepareData(out, o)], { stdio: "inherit" });
  const win = JSON.parse(readFileSync(join(out, "probe.window.json"), "utf8"));
  const png = join(out, "probe.png");
  return {
    url: resolve(o.app),
    title: win.title,
    aria: readFileSync(join(out, "probe.aria.yml"), "utf8"),
    screenshot: existsSync(png) ? readFileSync(png) : Buffer.alloc(0),
    themeColor: null,
    native: true,
  };
}

export function recordNative(out: string, plan: DemoPlan, o: NativeOpts) {
  const script = join(out, "actions.json");
  writeFileSync(script, JSON.stringify({ actions: plan.newWay.actions }, null, 2));
  execFileSync(driver(), ["run", "--app", resolve(o.app), "--out", out, "--script", script, "--", ...prepareData(out, o)], {
    stdio: "inherit",
  });
}
