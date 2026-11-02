---
name: ui-shots
description: 'Run when the user or another agent says "ui shots", "screenshot the mockup" or "show me the design", or names ui-shots. Also use when a design or UI change has a visual part that must be shown as real screenshots (rest and hover states) in chat or a PR, without launching Electron.'
---

# ui-shots

Render a UI mockup or a component in headless Chrome with Playwright and save PNGs (rest + interaction states such as hover) to send in chat or attach to a PR.

## Configuration

| Setting           | Value                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `CHROME`          | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (override with `CHROME_PATH`)                 |
| `PLAYWRIGHT_CORE` | `node_modules/.bun/playwright-core@*/node_modules/playwright-core/index.mjs` (globbed, highest version wins) |
| `SCRIPT`          | `.claude/skills/ui-shots/shots.mjs`, run with `bun`                                                          |

`playwright-core` is not hoisted to `node_modules/playwright-core`; the script globs `.bun/` in the worktree, then in the main checkout, so a version bump does not break it (override with `PLAYWRIGHT_CORE_DIR`). Playwright's own Chromium is **not** downloaded here and you must not install browsers (`playwright install`, `bunx playwright ...`): use the system Chrome. If a path above is wrong on this machine, fix this table.

## When to use

- A design or UI change has a visual part and the owner should see it, not read a description.
- A mockup (`apps/documentation/public/mockups/*.html` or a throwaway page) needs rest and hover pictures.
- A layout bug needs a quick look at the real component at the owner's window size.

Use [`verify`](../verify/SKILL.md) instead when a PR's proof row needs the **real Electron app** (IPC, main process, real recording). `ui-shots` proves what the browser renders from CSS and markup; it does not prove app behavior. Say which one a picture came from.

**Never launch Electron, the Playwright desktop suite, or `/verify` on the owner's machine.** This skill exists so you do not have to. It only drives headless Chrome.

## Shoot a static mockup

Run from outside the HTML's directory, and write to an empty output dir:

```bash
bun .claude/skills/ui-shots/shots.mjs <html-file-or-url> <out-dir> [options] [step ...]
```

Steps (default `full`); add ` as <name>` to name the PNG:

| Step                  | Writes                                     |
| --------------------- | ------------------------------------------ |
| `full`                | `full.png`, the whole page                 |
| `el:<selector>`       | one element                                |
| `hover:<selector>`    | `<name>-rest.png` and `<name>-hover.png`   |
| `hoverctx:<selector>` | same, but the shot is the element's parent |

Options: `--viewport=1440x720` (use the owner's window size for layout bugs), `--scale=2`, `--wait=300` (ms to let the UI settle before every shot, hover or not), `--css=<file|text>` (extra CSS after the freeze), `--no-freeze`.

Example (illustrative selectors):

```bash
bun .claude/skills/ui-shots/shots.mjs /tmp/mock/capture-preview.html /tmp/mock-shots \
  full "hover:.card.live as live"
```

By default every animation is paused and rewound to its first frame (after the page loads and the fonts are ready) and transitions are off, so shots are deterministic. `full` captures the whole page, not only the viewport; before each shot the pointer is parked in a viewport corner outside the shot's subject. If an animation must show a mid state (a draining progress bar), override it: `--css='.live .bar i{animation-delay:-4s!important}'`.

A static page that has no mockup yet: write one that inlines `packages/tokens/css/tokens.css` plus the component's `*.module.css` (unhashed class names) and mimics its container (the modal shell, `max-height`, flex column, `overflow`). It proves the CSS (flex and `min-height` chains, scroll containers), **not** the React markup; say so in the report.

## Shoot the real component (harness)

Better when the markup matters. A throwaway harness renders the real React component with the renderer's own Vite setup. Do not commit it.

1. In a worktree, add `src/renderer/harness.html` and `src/renderer/src/harness.tsx`: mock `window.electronAPI`, wrap in `I18nProvider`, and drive the store per `?s=<scene>`.
2. Add `harness.vite.config.ts` that copies the renderer's StyleX babel and postcss config.
3. `vite build` with the pinned binary, then serve the output (`python3 -m http.server <port>` from the build dir).
4. Run the script against `http://localhost:<port>/harness.html?s=<scene>`, once per scene. Wait for the UI to settle (modals fade in): use `--wait=800` or a longer wait.
5. Delete the harness before committing. Stage explicit paths only.

## Send the PNGs

- **Chat:** embed each PNG with its absolute path using Markdown image syntax, plus one line saying what it shows. Do not only link or describe it. Open at least one PNG first and confirm it shows the criterion, not a blank or half-animated screen.
- **PR:** the PNGs are local files, so upload them the way [`verify`](../verify/SKILL.md) describes (drag into the PR description or a comment, a gist, or a release asset) and put the link next to the proof row. For a gist, push with `-c 'credential.helper=!gh auth git-credential'` and embed the `gist.githubusercontent.com/.../raw/<file>` URLs.
- **Never commit** the PNGs, the harness, or output dirs.

## Common mistakes

- Running the script from inside the HTML's directory, or writing shots next to the source: use an empty `/tmp` dir for both.
- Shooting a hover without parking the pointer first: the script does this; a hand-rolled one must too, or the "rest" shot is already hovered.
- Installing Playwright browsers or launching Electron: neither is needed or allowed.
- Pinning `playwright-core@<version>` in a path: the version changes; glob it.
- Shooting before the UI settles (fade-ins, toasts): wait, then shoot.
- Presenting a CSS-only page as proof of the React component, or a harness as proof of the real app.
- Pasting `/tmp/...` paths into a PR as evidence: a reviewer cannot open them. Upload.
