import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkRemote, remoteOwnerAndRepo } from "./catalog-repo";
import type { LintResult } from "./lint";
import {
  backwardsReason,
  commitMessage,
  gitAncestry,
  parseAuthor,
  parsePublishArgs,
  publish,
} from "./publish";
import {
  compareVersions,
  describeStatus,
  parseStatusArgs,
  readRemoteManifest,
  statusCloneEnv,
  versionOfTag,
} from "./status";
import type { Manifest } from "./manifest";

const IDENTITY = { name: "Test Author", email: "author@example.test" };
const cleanLint = async (): Promise<LintResult> => ({
  hits: [],
  reviewByEye: [],
  unpublished: [],
  scanned: [],
  errors: [],
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function bareRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ui-catalog-bare-")) + "/catalog.git";
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--bare", "--quiet", "-b", "main");
  return dir;
}

function manifestOf(sha: string, generatedAt: string, version = "0.16.0"): Manifest {
  return {
    app: { name: "kaipu-record", version, sha: sha.padEnd(40, "0"), shortSha: sha },
    generatedAt,
    runner: { label: "macmini", macos: "27.0.1", scaleFactor: 1, display: "1920×1080" },
    options: { only: null, twice: false },
    profiles: [],
    screens: [
      {
        id: "record",
        kind: "route",
        where: "#/",
        windowSize: null,
        areas: [{ id: "record.mic", states: ["on"], gates: [] }],
        notCapturable: {},
        oneSided: {},
        notRun: [],
        covered: true,
        complete: true,
      },
    ],
    states: [],
    knownVariable: [],
    failures: [],
    nativeNotCapturable: [],
  } as unknown as Manifest;
}

/** An output folder named like a run's: `<short sha>/{manifest.json,README.md,screens,areas}`. */
function outputFolder(manifest: Manifest, folder = manifest.app.shortSha): string {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "ui-catalog-out-")), folder);
  mkdirSync(path.join(dir, "screens", "record"), { recursive: true });
  mkdirSync(path.join(dir, "areas", "record"), { recursive: true });
  writeFileSync(path.join(dir, "screens", "record", "page.png"), manifest.app.shortSha);
  writeFileSync(path.join(dir, "areas", "record", "mic.png"), manifest.app.shortSha);
  writeFileSync(path.join(dir, "README.md"), `# ${manifest.app.shortSha}`);
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(dir, "run.log"), "never published");
  return dir;
}

describe("remote check", () => {
  it("accepts only niway-dev/kaipu-ui-catalog on GitHub, over any alias or scheme", () => {
    for (const ok of [
      "git@github-csdev:niway-dev/kaipu-ui-catalog.git",
      "git@github.com:niway-dev/kaipu-ui-catalog",
      "https://github.com/niway-dev/kaipu-ui-catalog.git",
      "ssh://git@github.com/niway-dev/kaipu-ui-catalog.git",
    ]) {
      expect(checkRemote(ok)).toEqual({ ok: true });
    }
    for (const bad of [
      "git@github-csdev:niway-dev/kaipu-record.git",
      "git@github-csdev:someone/kaipu-ui-catalog.git",
      "https://github.com/niway-dev/kaipu-ui-catalog-fork",
      "github.com/niway-dev/kaipu-ui-catalog",
      "kaipu-ui-catalog",
    ]) {
      expect(checkRemote(bad).ok).toBe(false);
    }
  });

  it("refuses the right owner/repo on the wrong host, or with a query or fragment", () => {
    for (const bad of [
      "git@gitlab.com:niway-dev/kaipu-ui-catalog.git",
      "https://evil.example/niway-dev/kaipu-ui-catalog",
      "ssh://git@github-pento/niway-dev/kaipu-ui-catalog.git",
      "git@github-pento:niway-dev/kaipu-ui-catalog.git",
      "https://github.com/niway-dev/kaipu-ui-catalog?x=/a/b",
      "https://github.com/niway-dev/kaipu-ui-catalog#frag",
      "git@github.com:niway-dev/kaipu-ui-catalog.git?x=/a/b",
      "http://github.com/niway-dev/kaipu-ui-catalog",
      "https://github.com:8443/niway-dev/kaipu-ui-catalog",
      "https://github.com.evil.example/niway-dev/kaipu-ui-catalog",
    ]) {
      expect(checkRemote(bad).ok).toBe(false);
    }
  });

  it("allows a bare local repository by path or file:// URL", () => {
    const bare = bareRepo();
    expect(checkRemote(bare)).toEqual({ ok: true });
    expect(checkRemote(`file://${bare}`)).toEqual({ ok: true });
    expect(remoteOwnerAndRepo(`file://${bare}`)).toBeNull();
  });

  it("refuses a local path that is not a repository, or a working repository", () => {
    const work = mkdtempSync(path.join(tmpdir(), "ui-catalog-work-"));
    expect(checkRemote(work).ok).toBe(false);
    git(work, "init", "--quiet", "-b", "main");
    expect(checkRemote(work)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/working/),
    });
    expect(checkRemote(`file://${work}`).ok).toBe(false);
  });

  it("refuses the monorepo's own repository, from any of its folders", () => {
    const root = path.resolve(import.meta.dirname, "..", "..", "..");
    expect(checkRemote(root)).toMatchObject({ ok: false });
    expect(checkRemote(import.meta.dirname).ok).toBe(false);
    // A bare repository that shares the common dir is the same repository.
    const bare = bareRepo();
    expect(checkRemote(bare, bare)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/monorepo/),
    });
  });
});

describe("arguments and messages", () => {
  it("parses flags and a folder", () => {
    expect(parsePublishArgs(["out/abc", "--push", "--force", "--remote", "/r"])).toMatchObject({
      outDir: "out/abc",
      push: true,
      force: true,
      remote: "/r",
    });
    expect(parsePublishArgs(["--bogus"])).toEqual({ error: "unknown argument: --bogus" });
    expect(parsePublishArgs(["--remote"])).toEqual({ error: "--remote needs a value" });
  });

  it("parses Name <email> and refuses anything else", () => {
    expect(parseAuthor("A B <a@b.c>")).toEqual({ name: "A B", email: "a@b.c" });
    expect(parseAuthor("just a name")).toBeNull();
  });

  it("writes the commit subject from the manifest", () => {
    expect(commitMessage(manifestOf("b73d7ab1", "2026-11-04T20:04:36.581Z"))).toBe(
      "catalog: kaipu-record 0.16.0 2026-11-04 @ b73d7ab1",
    );
  });

  it("refuses to go backwards on an older date", () => {
    const current = manifestOf("aaaaaaaa", "2026-11-04T10:00:00Z");
    expect(backwardsReason(null, current)).toBeNull();
    expect(
      backwardsReason(current, manifestOf("bbbbbbbb", "2026-11-05T10:00:00Z"), () => true),
    ).toBeNull();
    expect(
      backwardsReason(current, manifestOf("cccccccc", "2026-11-03T10:00:00Z"), () => true),
    ).toMatch(/--force/);
  });

  it("refuses an older app version even when the run is fresh", () => {
    const current = manifestOf("aaaaaaaa", "2026-11-04T10:00:00Z", "0.16.0");
    const oldTag = manifestOf("bbbbbbbb", "2026-11-06T10:00:00Z", "0.15.1");
    expect(backwardsReason(current, oldTag, () => true)).toMatch(/newer app version/);
    const sameVersion = manifestOf("cccccccc", "2026-11-06T10:00:00Z", "0.16.0");
    expect(backwardsReason(current, sameVersion, () => true)).toBeNull();
  });

  it("refuses a commit that does not descend from the current one", () => {
    const current = manifestOf("aaaaaaaa", "2026-11-04T10:00:00Z");
    const incoming = manifestOf("bbbbbbbb", "2026-11-05T10:00:00Z");
    expect(backwardsReason(current, incoming, () => false)).toMatch(/not an ancestor/);
    expect(backwardsReason(current, incoming, () => true)).toBeNull();
  });

  it("refuses when the ancestry cannot be checked, and says why", () => {
    const current = manifestOf("aaaaaaaa", "2026-11-04T10:00:00Z");
    const incoming = manifestOf("bbbbbbbb", "2026-11-05T10:00:00Z");
    expect(backwardsReason(current, incoming, () => null)).toMatch(/unknown in this clone/);
    // The default check is "cannot tell", so a caller that passes nothing is refused too.
    expect(backwardsReason(current, incoming)).toMatch(/--force/);
    // The same commit needs no ancestry check.
    expect(backwardsReason(current, manifestOf("aaaaaaaa", "2026-11-05T10:00:00Z"))).toBeNull();
  });

  it("gitAncestry reads a real repository: yes, no and unknown", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "ui-catalog-anc-"));
    git(repo, "init", "--quiet", "-b", "main");
    const commit = (m: string): string => {
      git(
        repo,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.test",
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        m,
      );
      return git(repo, "rev-parse", "HEAD");
    };
    const first = commit("one");
    const second = commit("two");
    const check = gitAncestry(repo);
    expect(check(first, second)).toBe(true);
    expect(check(second, first)).toBe(false);
    expect(check("f".repeat(40), second)).toBeNull();
  });
});

describe("publish", { timeout: 30_000 }, () => {
  let remote: string;
  beforeEach(() => {
    remote = bareRepo();
  });

  it("commits the four published items to an empty repository, and only with --push pushes", async () => {
    const manifest = manifestOf("11111111", "2026-11-04T10:00:00Z");
    const out = outputFolder(manifest);
    const result = await publish({
      isAncestor: () => true,
      outDir: out,
      remote,
      push: false,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(result.status).toBe("published");
    if (result.status !== "published") return;
    expect(result.message).toBe("catalog: kaipu-record 0.16.0 2026-11-04 @ 11111111");
    expect(git(result.cloneDir, "log", "-1", "--format=%s|%an|%ae")).toBe(
      `${result.message}|Test Author|author@example.test`,
    );
    const files = git(result.cloneDir, "ls-files").split("\n");
    expect(files).toEqual([
      "README.md",
      "manifest.json",
      "versions/0.16.0/README.md",
      "versions/0.16.0/areas/record/mic.png",
      "versions/0.16.0/manifest.json",
      "versions/0.16.0/record.md",
      "versions/0.16.0/screens/record/page.png",
    ]);
    // Not pushed: the bare repository still has no commits.
    expect(() => git(remote, "rev-parse", "main")).toThrow();

    const pushed = await publish({
      isAncestor: () => true,
      outDir: out,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(pushed.status).toBe("published");
    expect(git(remote, "log", "-1", "--format=%s", "main")).toBe(result.message);
  });

  it("never copies the images of an unpublished state", async () => {
    const manifest = {
      ...manifestOf("11111111", "2026-11-04T10:00:00Z"),
      states: [
        {
          id: "record/page",
          status: "shot",
          window: { file: "screens/record/page.png" },
          areasFound: [{ id: "record.mic", file: "areas/record/mic.png" }],
        },
        {
          id: "record/windows",
          status: "shot",
          unpublished: "shows the runner's real open windows",
          window: { file: "screens/record/windows.png" },
          areasFound: [{ id: "record.sourcePicker", file: "areas/record/picker.png" }],
        },
      ],
    } as unknown as Manifest;
    const out = outputFolder(manifest);
    writeFileSync(path.join(out, "screens", "record", "windows.png"), "real windows");
    writeFileSync(path.join(out, "areas", "record", "picker.png"), "real windows");
    const result = await publish({
      isAncestor: () => true,
      outDir: out,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(result.status).toBe("published");
    const files = git(remote, "ls-tree", "-r", "--name-only", "main").split("\n");
    expect(files).toContain("versions/0.16.0/screens/record/page.png");
    expect(files).toContain("versions/0.16.0/areas/record/mic.png");
    expect(files).not.toContain("versions/0.16.0/screens/record/windows.png");
    expect(files).not.toContain("versions/0.16.0/areas/record/picker.png");
  });

  it("replaces the previous images and reports an identical republish as unchanged", async () => {
    const first = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z"));
    await publish({
      isAncestor: () => true,
      outDir: first,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    const again = await publish({
      isAncestor: () => true,
      outDir: first,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(again.status).toBe("unchanged");

    const second = outputFolder(manifestOf("22222222", "2026-11-05T10:00:00Z", "0.17.0"));
    const result = await publish({
      isAncestor: () => true,
      outDir: second,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(result.status).toBe("published");
    expect(git(remote, "log", "--format=%s", "main").split("\n")).toEqual([
      "catalog: kaipu-record 0.17.0 2026-11-05 @ 22222222",
      "catalog: kaipu-record 0.16.0 2026-11-04 @ 11111111",
    ]);
    expect(git(remote, "show", "main:versions/0.17.0/screens/record/page.png")).toBe("22222222");
    expect(git(remote, "show", "main:versions/0.16.0/screens/record/page.png")).toBe("11111111");
  });

  it("keeps one folder per version: a recount replaces its folder, a new version adds one, legacy files go", async () => {
    const run = (out: string) =>
      publish({
        isAncestor: () => true,
        outDir: out,
        remote,
        push: true,
        force: false,
        identity: IDENTITY,
        lint: cleanLint,
      });
    // The old flat layout, as the repository holds it today.
    const seed = mkdtempSync(path.join(tmpdir(), "ui-catalog-seed-"));
    git(seed, "init", "--quiet", "-b", "main");
    mkdirSync(path.join(seed, "screens", "record"), { recursive: true });
    mkdirSync(path.join(seed, "areas", "record"), { recursive: true });
    writeFileSync(path.join(seed, "screens", "record", "page.png"), "legacy");
    writeFileSync(path.join(seed, "areas", "record", "mic.png"), "legacy");
    writeFileSync(path.join(seed, "README.md"), "# old");
    writeFileSync(
      path.join(seed, "manifest.json"),
      JSON.stringify(manifestOf("00000000", "2026-11-03T10:00:00Z", "0.15.0")),
    );
    git(seed, "add", ".");
    git(
      seed,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.test",
      "commit",
      "--quiet",
      "-m",
      "legacy",
    );
    git(seed, "push", "--quiet", remote, "HEAD:main");

    const a = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z", "0.16.0"));
    expect((await run(a)).status).toBe("published");
    let files = git(remote, "ls-tree", "-r", "--name-only", "main").split("\n");
    expect(files.filter((f) => f.startsWith("screens/") || f.startsWith("areas/"))).toEqual([]);

    // A recount of the same version: another SHA, the folder is replaced.
    const recount = outputFolder(manifestOf("33333333", "2026-11-04T15:00:00Z", "0.16.0"));
    expect((await run(recount)).status).toBe("published");
    expect(git(remote, "show", "main:versions/0.16.0/screens/record/page.png")).toBe("33333333");

    const b = outputFolder(manifestOf("22222222", "2026-11-05T10:00:00Z", "0.17.0"));
    expect((await run(b)).status).toBe("published");
    files = git(remote, "ls-tree", "-r", "--name-only", "main").split("\n");
    expect(files).toEqual([
      "README.md",
      "manifest.json",
      "versions/0.16.0/README.md",
      "versions/0.16.0/areas/record/mic.png",
      "versions/0.16.0/manifest.json",
      "versions/0.16.0/record.md",
      "versions/0.16.0/screens/record/page.png",
      "versions/0.17.0/README.md",
      "versions/0.17.0/areas/record/mic.png",
      "versions/0.17.0/manifest.json",
      "versions/0.17.0/record.md",
      "versions/0.17.0/screens/record/page.png",
    ]);
    const root = git(remote, "show", "main:README.md");
    expect(root.indexOf("versions/0.17.0/README.md")).toBeGreaterThan(-1);
    expect(root.indexOf("versions/0.17.0/README.md")).toBeLessThan(
      root.indexOf("versions/0.16.0/README.md"),
    );
    expect(JSON.parse(git(remote, "show", "main:manifest.json")).app.version).toBe("0.17.0");
    expect(git(remote, "show", "main:versions/0.17.0/README.md")).toContain("(record.md)");
  });

  it("refuses an older run without --force and allows it with --force", async () => {
    const newer = outputFolder(manifestOf("22222222", "2026-11-05T10:00:00Z"));
    await publish({
      isAncestor: () => true,
      outDir: newer,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    const older = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z"));

    const refused = await publish({
      isAncestor: () => true,
      outDir: older,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(refused).toMatchObject({ status: "refused" });
    expect(git(remote, "log", "--format=%s", "main").split("\n")).toHaveLength(1);

    const forced = await publish({
      isAncestor: () => true,
      outDir: older,
      remote,
      push: true,
      force: true,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(forced.status).toBe("published");
    expect(git(remote, "log", "--format=%s", "main").split("\n")).toHaveLength(2);
  });

  it("refuses a folder whose name is not its manifest's SHA", async () => {
    const out = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z"), "99999999");
    const result = await publish({
      isAncestor: () => true,
      outDir: out,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(result).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("99999999"),
    });
  });

  it("refuses when the lint finds a hit, before touching the remote", async () => {
    const out = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z"));
    const dirty = async (): Promise<LintResult> => ({
      hits: [{ file: "<output>/README.md", line: 1, entry: "Cricut" }],
      reviewByEye: [],
      unpublished: [],
      scanned: [],
      errors: [],
    });
    const result = await publish({
      isAncestor: () => true,
      outDir: out,
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: dirty,
    });
    expect(result.status).toBe("refused");
    expect(() => git(remote, "rev-parse", "main")).toThrow();
  });

  it("refuses a GitHub remote that is not the catalog repository", async () => {
    const out = outputFolder(manifestOf("11111111", "2026-11-04T10:00:00Z"));
    const result = await publish({
      isAncestor: () => true,
      outDir: out,
      remote: "git@github-csdev:niway-dev/kaipu-record.git",
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect(result.status).toBe("refused");
  });
});

describe("status", () => {
  it("compares versions and tags", () => {
    expect(versionOfTag("desktop-v0.16.0")).toBe("0.16.0");
    expect(versionOfTag("web-v1.0.0")).toBeNull();
    expect(compareVersions("0.16.1", "0.16.0")).toBeGreaterThan(0);
    expect(compareVersions("0.9.0", "0.16.0")).toBeLessThan(0);
    expect(compareVersions("0.16.0", "0.16.0-rc.1")).toBeGreaterThan(0);
  });

  it("says current or behind", () => {
    const manifest = manifestOf("b73d7ab1", "2026-11-04T20:04:36.581Z");
    expect(describeStatus(manifest, "desktop-v0.16.0")).toBe(
      "last recount: kaipu-record 0.16.0 on 2026-11-04 @ b73d7ab1; current",
    );
    expect(describeStatus(manifest, "desktop-v0.17.0")).toMatch(/behind desktop-v0\.17\.0$/);
    expect(describeStatus(manifest, null)).toMatch(/no desktop-v\* tag/);
  });

  it("parses --remote", () => {
    expect(parseStatusArgs(["--remote", "/r"])).toEqual({ remote: "/r" });
    expect(parseStatusArgs(["--x"])).toEqual({ error: "unknown argument: --x" });
  });

  it("reads main of a bare repository, and says null for an empty or missing one", async () => {
    const remote = bareRepo();
    expect(await readRemoteManifest(remote)).toBeNull();
    expect(await readRemoteManifest(path.join(remote, "nowhere"))).toBeNull();

    const manifest = manifestOf("11111111", "2026-11-04T10:00:00Z");
    await publish({
      isAncestor: () => true,
      outDir: outputFolder(manifest),
      remote,
      push: true,
      force: false,
      identity: IDENTITY,
      lint: cleanLint,
    });
    expect((await readRemoteManifest(remote))?.app.shortSha).toBe("11111111");
    expect(
      JSON.parse(readFileSync(path.join(outputFolder(manifest), "manifest.json"), "utf8")).app
        .version,
    ).toBe("0.16.0");
  });

  it("clones without any prompt: BatchMode ssh, appended to an existing GIT_SSH_COMMAND", () => {
    expect(statusCloneEnv({})).toMatchObject({
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=5",
    });
    expect(statusCloneEnv({ GIT_SSH_COMMAND: "ssh -i /k" }).GIT_SSH_COMMAND).toBe(
      "ssh -i /k -o BatchMode=yes -o ConnectTimeout=5",
    );
  });

  it("kills the whole process tree of a clone that times out", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "ui-catalog-fakegit-"));
    const pidFile = path.join(bin, "pid");
    // A fake git that starts a long-lived grandchild, like git starting ssh.
    writeFileSync(path.join(bin, "git"), `#!/bin/sh\nsleep 30 &\necho $! > "${pidFile}"\nwait\n`, {
      mode: 0o755,
    });
    const started = Date.now();
    const result = await readRemoteManifest("/nowhere", {
      timeoutMs: 400,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(5000);
    const grandchild = Number(readFileSync(pidFile, "utf8").trim());
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(grandchild, 0)).toThrow();
  });
});
