/** Pull everything a storyteller needs from a GitHub repo: pitch, README, stack, structure. */

export type RepoInfo = {
  fullName: string;
  description: string;
  homepage: string;
  stars: number;
  topics: string[];
  language: string;
  readme: string;
  tree: string[];
  manifests: Record<string, string>;
};

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "Package.swift", "build.sh"];

export const isLocal = (input: string) => existsSync(input) && statSync(input).isDirectory();

/** A local checkout: sees uncommitted work and needs no GitHub access. */
export function readLocalRepo(dir: string): RepoInfo {
  const root = resolve(dir);
  let tree: string[];
  try {
    tree = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    tree = [];
  }
  const readmeName = tree.find((f) => /^readme(\.md)?$/i.test(f));
  const readme = readmeName ? readFileSync(join(root, readmeName), "utf8") : "";
  const manifests: Record<string, string> = {};
  for (const f of MANIFESTS) if (tree.includes(f)) manifests[f] = readFileSync(join(root, f), "utf8");
  const firstPara = readme.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  return {
    fullName: basename(root),
    description: firstPara.replace(/\s+/g, " ").trim().slice(0, 300),
    homepage: "",
    stars: 0,
    topics: [],
    language: "",
    readme,
    tree,
    manifests,
  };
}

export function parseRepo(input: string): string {
  if (isLocal(input)) return `local/${basename(resolve(input))}`;
  const m = input.match(/(?:github\.com[/:])?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  if (!m) throw new Error(`Not a GitHub repo: ${input}`);
  return m[1];
}

async function gh(path: string, raw = false): Promise<any> {
  const headers: Record<string, string> = {
    "User-Agent": "demoday",
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
  return raw ? res.text() : res.json();
}

export async function fetchRepo(input: string): Promise<RepoInfo> {
  const name = parseRepo(input);
  const meta = await gh(`/repos/${name}`);
  if (!meta) throw new Error(`Repo not found (private repos need GITHUB_TOKEN): ${name}`);
  const [readme, treeRes] = await Promise.all([
    gh(`/repos/${name}/readme`, true),
    gh(`/repos/${name}/git/trees/${meta.default_branch}?recursive=1`),
  ]);
  const tree: string[] = (treeRes?.tree ?? [])
    .filter((n: any) => n.type === "blob" && !/(^|\/)(node_modules|dist|vendor|\.git)\//.test(n.path))
    .map((n: any) => n.path);

  const manifests: Record<string, string> = {};
  for (const f of MANIFESTS) {
    if (tree.includes(f)) manifests[f] = (await gh(`/repos/${name}/contents/${f}`, true)) ?? "";
  }

  return {
    fullName: meta.full_name,
    description: meta.description ?? "",
    homepage: meta.homepage ?? "",
    stars: meta.stargazers_count,
    topics: meta.topics ?? [],
    language: meta.language ?? "",
    readme: readme ?? "",
    tree,
    manifests,
  };
}
