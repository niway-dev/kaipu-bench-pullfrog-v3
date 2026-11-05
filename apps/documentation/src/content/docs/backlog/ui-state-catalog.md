---
title: UI state catalog
description: On-demand screenshots of every desktop screen, area and state, taken from the real Electron app on the Mac mini and published to a private repository.
---

# UI state catalog

> **Status: 🟢 Ready to validate.** Implemented by the NIW2-628 / NIW2-629 / NIW2-630 stack; the
> PRs are pending review and the catalog has not been recounted for a release yet. The private
> catalog repository `niway-dev/kaipu-ui-catalog` exists (created 2026-11-04) and holds the first
> run, published from this stack's head (`catalog: kaipu-record 0.16.0 2026-11-04 @ ccbbe5b6`).

## What it is

- A typed UI map (`src/shared/ui-map.ts`) declares every screen, area and state of the desktop app.
- A catalog (`apps/kaipu-record/ui-catalog/catalog/`) says, as data, how to reach each state in the real app.
- A run launches the built Electron app on the Mac mini, walks the catalog and shoots every state,
  then writes the images, a `manifest.json` and a generated `README.md`.
- A deny-list lint checks the seed, the descriptions and the generated text before anything leaves
  the machine, and lists the images that embed real screen content for a look by eye.
- Publish copies one run into the private catalog repository as a single commit; status says
  whether the catalog is behind the newest `desktop-v*` release.

## Commands

Run from `apps/kaipu-record`. Electron starts only on the mini, never on the owner's machine.

| Command                                                 | What it does                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run ui-catalog:remote [--sha] [--only] [--twice]`  | Runs the catalog on the mini and copies the output to `.evidence/ui-catalog/`.       |
| `bun run ui-catalog:lint [<output dir>]`                | Deny-list scan; prints the review-by-eye list.                                       |
| `bun run ui-catalog:publish [<dir>] [--push] [--force]` | Lints, then makes one commit in a temp clone of the catalog repository.              |
| `bun run ui-catalog:status [--remote <url>]`            | Last recount, `current` or `behind desktop-vX.Y.Z`. Also printed by `bun run setup`. |

Recounting after a release is a manual step of the desktop release; see
[CI/CD pipelines](/deployment/ci-cd-pipelines). No workflow touches the catalog.

## Links

- Spec: [UI state catalog design](/specs/2026-11-04-ui-state-catalog-design)
- ADRs: [0044](/architecture/decisions/0044-the-ui-state-catalog-runs-the-real-app-on-the-mac-mini/)
  (driver), [0045](/architecture/decisions/0045-ui-catalog-images-live-in-a-separate-repository/)
  (storage), [0046](/architecture/decisions/0046-a-typed-ui-map-declares-every-screen-area-and-state/)
  (the UI map)
- Writing a screen's catalog: `apps/kaipu-record/ui-catalog/catalog/README.md`

## Before it counts as done

1. Recount at the next desktop release, then fold this page into a `desktop/` reference doc.
2. A state marked `unpublished` (today `record/source-picker-windows`, which shows the runner's real
   open windows) is shot locally and never published; its README row says why.
