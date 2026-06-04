/**
 * push-to-github.ts
 * Pushes the current workspace to GitHub using the Git Data REST API.
 * No `git push` needed — works inside the Replit sandbox.
 *
 * Efficiency: git blob SHAs are content-addressed and identical to GitHub blob
 * SHAs. Files whose SHA already exists on GitHub are referenced directly in
 * the new tree — no blob upload needed. Only new/changed files hit the API.
 *
 * Usage:  pnpm --filter @workspace/scripts run push-github
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const REPO = "JBlizzard-sketch/salon-seal";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!TOKEN) {
  console.error("❌ GITHUB_PERSONAL_ACCESS_TOKEN is not set");
  process.exit(1);
}

const BASE = `https://api.github.com/repos/${REPO}`;
const headers: Record<string, string> = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "salon-seal-sync/1.0",
  "Content-Type": "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gh<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  const body = (await res.json()) as T;
  if (!res.ok) {
    console.error(`GitHub API error ${res.status} on ${path}:`, JSON.stringify(body, null, 2));
    throw new Error(`GitHub API ${res.status}`);
  }
  return body;
}

function git(cmd: string, cwd?: string): string {
  return execSync(`git --no-optional-locks ${cmd}`, { encoding: "utf8", cwd }).trim();
}

function getRoot(): string {
  return git("rev-parse --show-toplevel");
}

/** All tracked files with their local git blob SHAs (already computed by git) */
function getTrackedFiles(root: string): Array<{ path: string; mode: string; blobSha: string }> {
  const lines = git("ls-files -s", root).split("\n").filter(Boolean);
  return lines.map((line) => {
    // Format: <mode> <blob-sha> <stage>\t<path>
    const tab = line.indexOf("\t");
    const meta = line.slice(0, tab).trim().split(/\s+/);
    const mode = meta[0];
    const blobSha = meta[1];
    const filePath = line.slice(tab + 1);
    return { path: filePath, mode, blobSha };
  });
}

function fileContentBase64(root: string, filePath: string): string {
  const abs = resolve(root, filePath);
  if (!existsSync(abs)) return "";
  return readFileSync(abs).toString("base64");
}

async function main() {
  const root = getRoot();
  console.log(`📂 Repo root: ${root}`);

  // 1. Get GitHub branch state
  let parentSha: string | null = null;
  const githubBlobShas = new Set<string>();

  try {
    const ref = await gh<{ object: { sha: string } }>(`/git/refs/heads/${BRANCH}`);
    parentSha = ref.object.sha;
    console.log(`🔗 GitHub HEAD: ${parentSha}`);

    // Fetch the full GitHub tree to build the set of known blob SHAs
    const treeRes = await gh<{ tree: Array<{ sha: string; type: string }> }>(
      `/git/trees/${parentSha}?recursive=1`,
    );
    for (const entry of treeRes.tree) {
      if (entry.type === "blob") githubBlobShas.add(entry.sha);
    }
    console.log(`🌲 Known GitHub blobs: ${githubBlobShas.size}`);
  } catch {
    console.log("ℹ️  Branch not found on GitHub — will create fresh");
  }

  // 2. Enumerate all tracked files
  const files = getTrackedFiles(root);
  console.log(`📄 Tracked files: ${files.length}`);

  // 3. Separate files into "already on GitHub" vs "need upload"
  const alreadyOnGitHub = files.filter((f) => githubBlobShas.has(f.blobSha));
  const needUpload = files.filter((f) => !githubBlobShas.has(f.blobSha));

  console.log(`✅ Re-using ${alreadyOnGitHub.length} unchanged blobs`);
  console.log(`⬆️  Uploading ${needUpload.length} new/changed blobs…`);

  // 4. Build tree entries — re-use existing SHAs where possible
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [
    ...alreadyOnGitHub.map(({ path, mode, blobSha }) => ({
      path,
      mode,
      type: "blob",
      sha: blobSha,
    })),
  ];

  // 5. Upload only changed blobs, in small rate-limited batches
  const BATCH = 5;
  const DELAY_MS = 500; // 500 ms between batches to stay under rate limits
  for (let i = 0; i < needUpload.length; i += BATCH) {
    const batch = needUpload.slice(i, i + BATCH);
    process.stdout.write(`   ${i + 1}–${Math.min(i + BATCH, needUpload.length)} / ${needUpload.length}\r`);

    const results = await Promise.all(
      batch.map(async ({ path: filePath, mode, blobSha }) => {
        const content = fileContentBase64(root, filePath);
        if (!content) {
          // File doesn't exist locally — skip (shouldn't happen for tracked files)
          return { path: filePath, mode, type: "blob", sha: blobSha };
        }
        const blob = await gh<{ sha: string }>("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content, encoding: "base64" }),
        });
        return { path: filePath, mode, type: "blob", sha: blob.sha };
      }),
    );
    treeEntries.push(...results);
    if (i + BATCH < needUpload.length) await sleep(DELAY_MS);
  }
  if (needUpload.length > 0) console.log("\n✅ Blobs uploaded");

  // 6. Create the new tree
  console.log("🌲 Creating tree…");
  const tree = await gh<{ sha: string }>("/git/trees", {
    method: "POST",
    body: JSON.stringify({ tree: treeEntries }),
  });
  console.log(`🌲 Tree: ${tree.sha}`);

  // 7. Create commit
  let localMsg = "chore: sync workspace to GitHub";
  try { localMsg = git("log -1 --pretty=%s"); } catch { /* ignore */ }
  const timestamp = new Date().toISOString();
  const commitBody: Record<string, unknown> = {
    message: `${localMsg}\n\n[auto-synced ${timestamp}]`,
    tree: tree.sha,
    author: { name: "SalonSeal Bot", email: "ci@salon-seal.app", date: timestamp },
  };
  if (parentSha) commitBody.parents = [parentSha];

  const commit = await gh<{ sha: string }>("/git/commits", {
    method: "POST",
    body: JSON.stringify(commitBody),
  });
  console.log(`✅ Commit: ${commit.sha}`);

  // 8. Update / create the branch ref
  if (parentSha) {
    await gh(`/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: true }),
    });
  } else {
    await gh("/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
    });
  }

  console.log(`\n🎉 Pushed → https://github.com/${REPO}/tree/${BRANCH}`);
}

main().catch((err) => {
  console.error("Push failed:", err);
  process.exit(1);
});
