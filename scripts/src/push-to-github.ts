/**
 * push-to-github.ts
 * Mirrors local commits to GitHub using the Git Data REST API.
 * No `git push` required — works inside the Replit sandbox.
 *
 * Two modes:
 *  SNAPSHOT (first sync, no state file): creates one GitHub commit that
 *    captures the full current HEAD state.  Avoids replaying all historical
 *    commits (which would upload hundreds of blobs and hit rate limits).
 *
 *  INCREMENTAL (state file exists): creates one GitHub commit per new local
 *    commit, preserving history from that point forward.
 *
 * Idempotent: if HEAD == last-synced SHA, exits with no API calls.
 *
 * Blob efficiency: blobs are content-addressed identically by git and
 *   GitHub.  Files whose SHA already exists on GitHub are referenced
 *   directly — no upload needed.  Only new/changed blobs hit the API.
 *
 * Usage:  pnpm --filter @workspace/scripts run push-github
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const REPO   = "JBlizzard-sketch/salon-seal";
const BRANCH = "main";
const TOKEN  = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const BATCH  = 5;       // concurrent blob uploads per burst
const DELAY  = 600;     // ms between upload batches (rate-limit headroom)
const RETRY_AFTER = 90_000; // ms to wait after a 429/403 secondary-limit hit

if (!TOKEN) {
  console.error("❌ GITHUB_PERSONAL_ACCESS_TOKEN is not set");
  process.exit(1);
}

const GH_BASE = `https://api.github.com/repos/${REPO}`;
const GH_HEADERS: Record<string, string> = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "salon-seal-sync/1.0",
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// GitHub REST helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function gh<T = unknown>(path: string, opts: RequestInit = {}, retries = 2): Promise<T> {
  const url = path.startsWith("https://") ? path : `${GH_BASE}${path}`;
  const res = await fetch(url, { ...opts, headers: { ...GH_HEADERS, ...(opts.headers ?? {}) } });
  if (res.status === 403 || res.status === 429) {
    if (retries > 0) {
      console.log(`  ⏳ Rate-limited (${res.status}). Waiting ${RETRY_AFTER / 1000}s then retrying…`);
      await sleep(RETRY_AFTER);
      return gh<T>(path, opts, retries - 1);
    }
  }
  const body = (await res.json()) as T;
  if (!res.ok) {
    console.error(`GitHub API ${res.status} on ${path}:`, JSON.stringify(body, null, 2));
    throw new Error(`GitHub API ${res.status}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Git read helpers (read-only — safe in any environment)
// ---------------------------------------------------------------------------

function git(cmd: string, cwd?: string): string {
  return execSync(`git --no-optional-locks ${cmd}`, { encoding: "utf8", cwd }).trim();
}
const getRoot = () => git("rev-parse --show-toplevel");

/** Commits from `base` (exclusive) to HEAD (inclusive), oldest-first. */
function newCommitShas(root: string, base: string | null): string[] {
  const range = base ? `${base}..HEAD` : "HEAD";
  return git(`log ${range} --format=%H --reverse`, root).split("\n").filter(Boolean);
}

interface CommitMeta { sha: string; authorEmail: string; authorName: string; authorDate: string; message: string; }
function readCommit(sha: string, root: string): CommitMeta {
  return {
    sha,
    authorEmail: git(`log -1 --format=%ae ${sha}`, root),
    authorName:  git(`log -1 --format=%an ${sha}`, root),
    authorDate:  git(`log -1 --format=%aI ${sha}`, root),
    message:     git(`log -1 --format=%B ${sha}`, root),
  };
}

/** Files tracked at a specific commit. */
function filesAtCommit(sha: string, root: string) {
  return git(`ls-tree -r ${sha}`, root).split("\n").filter(Boolean).map((line) => {
    const tab = line.indexOf("\t");
    const [mode, , blobSha] = line.slice(0, tab).trim().split(/\s+/);
    return { path: line.slice(tab + 1), mode, blobSha };
  });
}

function blobBase64(blobSha: string, root: string): string {
  return execSync(`git --no-optional-locks cat-file blob ${blobSha}`, { cwd: root }).toString("base64");
}

// ---------------------------------------------------------------------------
// Sync-state persistence  (.github-sync-sha — gitignored)
// ---------------------------------------------------------------------------

interface SyncState { localSha: string; githubSha: string; }
function stateFile(root: string) { return resolve(root, ".github-sync-sha"); }
function loadState(root: string): SyncState | null {
  const f = stateFile(root);
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")) as SyncState; } catch { return null; }
}
function saveState(root: string, s: SyncState) {
  writeFileSync(stateFile(root), JSON.stringify(s, null, 2));
}
function ensureGitignored(root: string) {
  const gi = resolve(root, ".gitignore");
  const entry = ".github-sync-sha";
  if (!existsSync(gi)) return;
  const content = readFileSync(gi, "utf8");
  if (!content.includes(entry)) writeFileSync(gi, content.trimEnd() + `\n${entry}\n`);
}

// ---------------------------------------------------------------------------
// Blob upload
// ---------------------------------------------------------------------------

async function uploadBlobs(
  files: Array<{ path: string; mode: string; blobSha: string }>,
  root: string,
  known: Set<string>,
): Promise<Array<{ path: string; mode: string; type: string; sha: string }>> {
  const reuse  = files.filter((f) => known.has(f.blobSha));
  const upload = files.filter((f) => !known.has(f.blobSha));

  if (upload.length > 0) process.stdout.write(`  ⬆️  ${upload.length} new blob(s)\n`);

  const entries: Array<{ path: string; mode: string; type: string; sha: string }> = [
    ...reuse.map(({ path, mode, blobSha }) => ({ path, mode, type: "blob", sha: blobSha })),
  ];

  for (let i = 0; i < upload.length; i += BATCH) {
    const batch = upload.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async ({ path, mode, blobSha }) => {
        const blob = await gh<{ sha: string }>("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: blobBase64(blobSha, root), encoding: "base64" }),
        });
        known.add(blob.sha);
        return { path, mode, type: "blob", sha: blob.sha };
      }),
    );
    entries.push(...results);
    if (i + BATCH < upload.length) await sleep(DELAY);
  }
  return entries;
}

async function buildTree(commitSha: string, root: string, known: Set<string>): Promise<string> {
  const files   = filesAtCommit(commitSha, root);
  const entries = await uploadBlobs(files, root, known);
  const tree    = await gh<{ sha: string }>("/git/trees", {
    method: "POST",
    body: JSON.stringify({ tree: entries }),
  });
  return tree.sha;
}

async function createCommit(meta: CommitMeta, treeSha: string, parentSha: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    message: meta.message,
    tree: treeSha,
    author: { name: meta.authorName, email: meta.authorEmail, date: meta.authorDate },
  };
  if (parentSha) body.parents = [parentSha];
  const c = await gh<{ sha: string }>("/git/commits", { method: "POST", body: JSON.stringify(body) });
  return c.sha;
}

async function updateRef(sha: string, exists: boolean) {
  if (exists) {
    await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha, force: true }) });
  } else {
    await gh("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }) });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const root      = getRoot();
  const localHEAD = git("rev-parse HEAD", root);

  console.log(`📂 ${root}`);
  console.log(`📌 Local HEAD: ${localHEAD.slice(0, 7)}`);

  ensureGitignored(root);
  const state = loadState(root);

  // Idempotency guard
  if (state?.localSha === localHEAD) {
    console.log("✅ Already in sync — nothing to push");
    return;
  }

  // Get GitHub branch state
  let ghParentSha: string | null = null;
  const known = new Set<string>();
  let branchExists = false;

  try {
    const ref = await gh<{ object: { sha: string } }>(`/git/refs/heads/${BRANCH}`);
    ghParentSha  = ref.object.sha;
    branchExists = true;
    console.log(`🔗 GitHub HEAD: ${ghParentSha.slice(0, 7)}`);

    const tree = await gh<{ tree: Array<{ sha: string; type: string }> }>(
      `/git/trees/${ghParentSha}?recursive=1`,
    );
    tree.tree.forEach((e) => { if (e.type === "blob") known.add(e.sha); });
    console.log(`🌲 Known GitHub blobs: ${known.size}`);
  } catch {
    console.log("ℹ️  Branch not yet on GitHub — will create fresh");
  }

  // --- SNAPSHOT MODE (first sync ever) ------------------------------------
  if (state === null) {
    console.log("🚀 First sync — snapshot mode (single commit for current HEAD)");
    const meta     = readCommit(localHEAD, root);
    const treeSha  = await buildTree(localHEAD, root, known);
    const ghSha    = await createCommit(meta, treeSha, ghParentSha);
    await updateRef(ghSha, branchExists);
    saveState(root, { localSha: localHEAD, githubSha: ghSha });
    console.log(`\n🎉 Pushed → https://github.com/${REPO}/tree/${BRANCH}`);
    return;
  }

  // --- INCREMENTAL MODE (replay new commits) -----------------------------
  const commits = newCommitShas(root, state.localSha);
  console.log(`🔄 Incremental sync: ${commits.length} new commit(s)`);

  if (commits.length === 0) {
    console.log("✅ Already in sync");
    return;
  }

  let currentGhSha = ghParentSha;

  for (let i = 0; i < commits.length; i++) {
    const sha  = commits[i];
    const meta = readCommit(sha, root);
    const label = meta.message.split("\n")[0].slice(0, 60);
    console.log(`\n[${i + 1}/${commits.length}] ${sha.slice(0, 7)} — ${label}`);

    const treeSha = await buildTree(sha, root, known);
    currentGhSha  = await createCommit(meta, treeSha, currentGhSha);
    console.log(`  ✅ → ${currentGhSha.slice(0, 7)}`);
  }

  await updateRef(currentGhSha!, branchExists);
  saveState(root, { localSha: localHEAD, githubSha: currentGhSha! });
  console.log(`\n🎉 Pushed ${commits.length} commit(s) → https://github.com/${REPO}/tree/${BRANCH}`);
}

main().catch((err) => {
  console.error("Push failed:", err);
  process.exit(1);
});
