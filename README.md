> **This repository:** `niway-dev/kaipu-bench-pullfrog-v3` · **Reviewer:** Pullfrog · **Replay manifest:** `manifest-546-2026-11-07.tsv` · set up with [`bench.sh`](https://github.com/niway-dev/wachiman/blob/main/docs/benchmark/replay/bench.sh)

# kaipu-bench: a code-review benchmark on real pull requests

This repository is one of three identical copies, one per reviewer, so that no reviewer reads
another's comments:

| Repository | Reviewer | How it runs here |
| --- | --- | --- |
| [kaipu-bench-wachi](https://github.com/niway-dev/kaipu-bench-wachi) | [Wachi Reviewer](https://github.com/niway-dev/wachiman) | `.github/workflows/wachi-bench.yml` on `main`, started with `/wachi review` on a pull request; the pin in that file names the engine version under test |
| [kaipu-bench-pullfrog](https://github.com/niway-dev/kaipu-bench-pullfrog) | [Pullfrog](https://pullfrog.com) | GitHub App installed by the owner; `.github/workflows/pullfrog.yml` on `main`, copied unchanged from kaipu-record |
| [kaipu-bench-coderabbit](https://github.com/niway-dev/kaipu-bench-coderabbit) | [CodeRabbit](https://coderabbit.ai) | GitHub App installed by the owner; no workflow |

It replays pull requests from the public repository
[niway-dev/kaipu-record](https://github.com/niway-dev/kaipu-record), a desktop screen recorder
(Electron, TypeScript, Bun monorepo). Nothing here is for development: branches are never merged,
and `main` holds only this file and the reviewer's workflow. Methodology, scoring and results live
in the benchmarks repository: [`wachiman-benchmarks`](https://github.com/niway-dev/wachiman-benchmarks/tree/main)
and the [benchmark spec](https://github.com/niway-dev/wachiman/blob/main/docs/specs/2026-10-31-review-benchmark-design.md).

## Point in time

Every replay branch is a real kaipu-record commit, pushed with its full history up to that commit.
No commit is rewritten, so each pull request's diff is byte-identical to the one the original
reviewers saw. The five exhibition replays sit on kaipu-record as of **2026-10-31 00:57–01:08 UTC**:

| Branch pair | Base commit | Head commit | Original PR |
| --- | --- | --- | --- |
| `replay/pr-463/{base,head}` | `c58b68f4` | `3ec7a138` | [#463](https://github.com/niway-dev/kaipu-record/pull/463) |
| `replay/pr-464/{base,head}` | `13b7ff5d` | `e45c8451` | [#464](https://github.com/niway-dev/kaipu-record/pull/464) |
| `replay/pr-465/{base,head}` | `13b7ff5d` | `dac8318b` | [#465](https://github.com/niway-dev/kaipu-record/pull/465) |
| `replay/pr-466/{base,head}` | `13b7ff5d` | `b2705a9c` | [#466](https://github.com/niway-dev/kaipu-record/pull/466) |
| `replay/pr-467/{base,head}` | `13b7ff5d` | `b12d760b` | [#467](https://github.com/niway-dev/kaipu-record/pull/467) |

`13b7ff5d` is the top of the Prepare stack (#459); `c58b68f4` is the webcam-recorder follow-ups
branch. Both bases carry kaipu-record's own workflows, which run on pull requests here and fail
for lack of secrets; that noise is not scored.

## Exhibition replays: what the live reviews found (2026-10-31, kaipu-record)

Both reviewers ran on Claude Opus 5.5. Every finding was checked by reading the code at the head.
Full per-PR reports: [`docs/benchmark/2026-10-31/`](https://github.com/niway-dev/wachiman-benchmarks/tree/main/2026-10-31).

| PR | Size | Wachi v1.2.0 | Pullfrog | Top user-facing bug and who caught it |
| --- | --- | --- | --- | --- |
| #463 camera off/on mid-take | 26 files, +1,899/−67 | 4 valid, $0.62 | 1 valid, $2.20 | **Both**, one each: face lost when the camera cannot reopen (Wachi, fixed `b0f028c`); random gap ids break Share reuse (Pullfrog, fixed `29395c3`) |
| #464 ready copy in the Library | 31 files, +1,171/−127 | 1 valid, $0.36 | 2 valid, $1.23 | Pullfrog: card's Show in Finder and drag skip `markCopySeen` |
| #465 recording detail | 14 files, +1,059/−559 | 2 valid, $0.48 | 1 valid, $1.15 | Pullfrog: new drag handle skips `markCopySeen` |
| #466 floating ready card | 28 files, +1,284/−13 | 2 valid, $0.46 | 2 valid, $1.14 | Pullfrog: Back re-shows the always-on-top card |
| #467 Export screen | 47 files, +2,676/−2,177 | 8 valid, $1.36 | 1 valid, $1.96 | Pullfrog: Export never re-lists the Library when an export finishes |
| **Total** | | **17 / 0 invalid, $3.28** | **7 / 0 invalid, $7.68** | |

Pattern: Wachi reads every file and reports test quality, accessibility, stale comments and
main-process edge cases; Pullfrog follows one action to its effect on the running app and reports
little else. No finding overlapped. Neither reviewer read the other's comments on first review.

### What we expect from the replays

- **Wachi, same version (v1.2.1):** the same 17 findings, give or take run-to-run variance. Three
  runs per PR measure that variance before any change is judged.
- **Wachi, next version** (flow questions, `contracts`, risk map; see the
  [design](https://github.com/niway-dev/wachiman/blob/main/docs/specs/2026-10-31-flow-questions-and-evidence-design.md)):
  keep the 17, gain the five Pullfrog-only bugs, stay well under $7.68.
- **Pullfrog, fresh repository:** its kaipu-record learnings file and per-PR summaries do not
  exist here. Same findings as live would mean the memory did not matter; fewer would measure
  what it was worth.
- **CodeRabbit:** first data point. Its Code Graph Analysis (definitions, references and co-change
  across the repository) targets exactly the cross-file class the Pullfrog-only bugs belong to.

Caveat: both Wachi and Pullfrog reviewed these PRs live, and Wachi's next version was designed
from these misses. The exhibition shows change over time; it proves nothing general. Claims come
from the controlled set below, judged blind.

## Controlled replays: real bugs, by how hard they were to catch

Mined read-only from kaipu-record on 2026-10-30: 145 real bugs from about 90 fix PRs, each traced
(SZZ: blame of the lines the fix changed) to the PR that introduced it. Catalogue and method:
[`kaipu-record-bug-catalogue.md`](https://github.com/niway-dev/wachiman-benchmarks/blob/main/kaipu-record-bug-catalogue.md).
By difficulty: 36 at level 5, 56 at level 4, 40 at level 3. Most common classes: state machines
(33), ordering races (28), data loss (16), cross-file contracts (15).

The **top 15** below are the pilot candidates (difficulty ≥ 4, introducing PR identified with
medium or high confidence, ≤ 40 files, bug at least partly visible in the diff). **Not yet
verified by hand; SZZ output is a candidate list.** No branch for them exists yet.

| Bug | Fix | Introduced | Class | Difficulty | Found by / fixed by | Live reviewer at the time |
| --- | --- | --- | --- | --- | --- | --- |
| Spare overlay loses state before its listener | #418 | #402 | race | 5 | owner / Opus 5.5 | **Wachi (earlier version) ran and missed it** |
| Activation-policy cache skips restore | #366 | #255 | state | 5 | user / Fable 5.1 | none |
| Auth IPC throw loses the error kind | #81 | #69 | cross-file | 5 | Opus 5 | none |
| `getSession` with a null body | #81 | #68 | state | 5 | Opus 5 | none |
| CSRF 403 from the origin | #79 | #68 | cross-file | 5 | Sonnet 5 | none |
| Bearer token exposed through the web proxy | #81 | #66 | security | 5 | Opus 5 | none |
| REC-B8: cursor tail cut uses a late wall clock | #416 | #143 | cross-file | 5 | Opus auditor / Opus 5.5 | none |
| Cursor tail cut floors the duration | #143 | #133 | data loss | 4 | Fable 5.1 / Fable 5.1 | none |
| A skipped required check reads green | #183 | #174 | CI | 5 | maintainer / Opus 5 | none |
| Ticket extend races read and release | #342 | #276 | race | 4 | Opus 5.5 | none |
| SHOT-B5: clearing a label deletes the wrong shape | #370 | #52 | race | 4 | Opus auditor / Sonnet 5.5 | none |
| SHOT-B1: save marks clean over a new edit | #360 | #18 | race | 4 | Opus auditor / Sonnet | none |
| "Exported" badge compares clocks | #159 | #156 | state | 4 | owner / Opus 5 | none |
| Label double-click broken by pointer capture | #187 | #184 | state | 5 | owner / Opus 5 | none |
| LIB-B12: drag-out copies the whole file | #412 | #269 | platform | 4 | Opus auditor / Opus 5.5 | none |

Three groups, and the question each one asks of a reviewer:

1. **Seen live and missed.** Wachi's earlier version reviewed kaipu from PR #301 on: of the
   catalogued bugs introduced after that, it caught 1 and missed 16 (#418←#402 above is one).
   Pullfrog was not installed yet. *Would any of the three catch them now, on the original diff?*
2. **Never reviewed by a bot.** Most of the top 15: found by users, by the owner, or by an audit
   run weeks later over the whole codebase, then fixed. *Could a reviewer have flagged them on the
   PR that introduced them, before they shipped?* This is the group that matters most, and it is
   where blind judging and clean control PRs are required.
3. **Introduced by a strong model's own fix.** #143 (Fable 5.1) introduced REC-B8; #255 introduced
   the activation-policy bug. *Does a reviewer catch what a strong author let through?*

Declared biases: Wachi's prompt was partly tuned on its kaipu reviews after #301; Pullfrog's
stored learnings include kaipu; most catalogued bugs were found by Claude models, which may favour
the two Claude-based reviewers over CodeRabbit.

## How this repository was set up

1. `bench.sh create <reviewer> <repo-name>`
   ([script](https://github.com/niway-dev/wachiman-benchmarks/blob/main/replay/bench.sh)):
   `gh repo create niway-dev/kaipu-bench-<reviewer>[-vN] --public`.
2. `main`: a fresh single commit with this README and the reviewer's files (Wachi: on-demand
   `wachi-bench.yml`, named apart from kaipu-record's `agent-review.yml`; Pullfrog: kaipu-record's
   `pullfrog.yml`; CodeRabbit: nothing).
3. From a kaipu-record clone, `git push <repo> <base-sha>:refs/heads/replay/pr-<n>/base
   <head-sha>:refs/heads/replay/pr-<n>/head` for every row of the
   [manifest](https://github.com/niway-dev/wachiman-benchmarks/blob/main/replay/manifest-2026-10-31.tsv).
4. A draft setup PR makes GitHub register the replayed commits' own workflows (`agent-review.yml`,
   Wachi v1.2.0, and `pr-checks.yml`); they are disabled and the PR is closed, so it is #1 and the
   replays start at #2. This happens before any API key secret exists.
5. Owner installs the Pullfrog and CodeRabbit apps on their repositories and adds the
   `ANTHROPIC_API_KEY` secret where needed.
6. `bench.sh open <repo-name>`: pull requests `[replay] <original title>` from `head` to `base`,
   labelled `replay`, one per branch pair, never merged, closed when the reviews are in. Wachi
   starts on a `/wachi review` comment, CodeRabbit on `@coderabbitai review` (its automatic review
   skips these PRs), Pullfrog when the PR opens.
7. Results are copied into the benchmarks repository under `<date>/`; GitHub
   expires Actions logs, so raw review bodies and tool-call lists are kept there too.

## Known limits

- Branch histories are full up to each commit, so the history of a later replay can contain the
  fix of an earlier one. A reviewer that only sees the pull request's head cannot reach it; one
  that walks other branches could.
- Pullfrog's `pullfrog.yml` is dispatched by its backend on `main`; CodeRabbit runs on its own
  servers. Only Wachi's runs leave logs in this repository's Actions.
