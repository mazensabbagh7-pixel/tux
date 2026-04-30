# Nux Canonical Status

**Read this before changing, building, cleaning, rebasing, or reinstalling Nux.**

## Identity

- **Nux** is Mazen's Linux AppImage fork of `coder/mux`.
- The GitHub repository is still named `tux`, but the product/runtime is **Nux**.
- **Nux is not Mux.** Mux is upstream/older naming and should not be treated as the current app identity.
- **Nux is not Claude Code.** Nux includes a Claude Code provider that reuses local Claude Code OAuth, but Nux is the desktop multiplexer app.

## Live Build in Use

| Field | Value |
|---|---|
| Installed AppImage | `/home/mazen/Applications/Nux.AppImage` |
| Known-good backup | `/home/mazen/Applications/Nux.AppImage.known-good-2b669c4cc83b.bak` |
| sha256 | `2b669c4cc83b73785fde89f8abcdbb9cab5fe1ed70c6c8612672153df16095f6` |
| Desktop launcher | `~/.local/share/applications/nux.desktop` |
| Launcher Exec | `/home/mazen/Applications/Nux.AppImage --no-sandbox %U` |
| User data | `~/.config/nux/` |
| Skills | `~/.nux/skills/` |
| MCP config | `~/.nux/mcp.jsonc` |

Mazen verified this installed build in the real app. Do **not** rebuild or reinstall unless Mazen explicitly asks.

## Source State

Current canonical repo path:

```text
/home/mazen/Documents/GitHub/tux
```

Primary safety branch:

```text
nux-safe-working-state-20260429
```

Live feature/source base:

```text
e925b9ea3 fix: narrow computer use server detection
```

The branch may later contain docs-only status commits above `e925b9ea3`; the live AppImage source state is `e925b9ea3` plus the preserved 152-file working tree.

Reviewable clean branch for the preserved 152-file rebrand/GPU-fix working tree:

```text
nux-rebrand-split-2026-04-30 @ c126c634c
```

Annotated tags pushed to origin:

```text
nux-safe-2026-04-30-e925b9ea
nux-rebrand-split-tag-2026-04-30
```

The current safety-branch working tree intentionally has **152 modified tracked files** and **0 untracked files**. Those edits are the second-pass `tux` → `nux` rebrand plus Linux GPU/AppImage launch hardening and are preserved in stash, patch, and split branch form.

## Features Added / Verified

Protected feature commits on the safety branch:

```text
e925b9ea3 fix: narrow computer use server detection
d47d27fa2 feat: add computer use diagnostics
ca24bb12f feat: add MCP health tests to plugins inventory
52f243bf4 fix: load plugins inventory without workspace runtime wait
e598ea18e feat: add plugins tool inventory
74e7dee09 feat: add Nux split workspace and Claude Code provider
f3720a5b3 chore: rename fork to Tux
```

User-verified features in the live app:

- Resizable split-screen workspaces.
- Original right sidebar/explorer remains visible in split-screen mode.
- Claude Code provider via local Claude Code OAuth credentials.
- Claude Code Opus/Sonnet OAuth attribution fix.
- Linux About diagnostics and launcher repair.
- Nux loading/splash branding.
- Data URI image media-type correction for mislabeled attachments.
- Settings → Plugins inventory.
- Plugins MCP server health tests.
- Settings → Computer Use diagnostics.
- Computer Use detection narrowed to actual desktop-control tooling.

## Safety / Recovery Artifacts

Do not delete these:

```text
/home/mazen/Documents/nux-patches/20260429-141004/
/home/mazen/Documents/nux-patches/appimage-backups/
/home/mazen/Documents/ThorVault/Projects/nux-snapshots/nux-rebrand-pass-2026-04-30-e925b9ea.patch
/home/mazen/Applications/Nux.AppImage.known-good-2b669c4cc83b.bak
```

Local stash backup:

```text
stash@{0}: nux: uncommitted second-pass tux→nux rebrand + linux disable-gpu fix on top of 2026-04-30 HEAD e925b9ea3
```

Patch/stash text hash:

```text
e8a4573cb56795462f07f68c725d8549710f9945c980c83594452396f30574c5
```

## Hard Rules for Future Work

- Do **not** run broad `git reset`, `git clean`, `git checkout .`, or destructive cleanup in this repo.
- Do **not** drop `stash@{0}` unless Mazen explicitly approves.
- Do **not** overwrite `/home/mazen/Applications/Nux.AppImage` unless Mazen explicitly asks for a rebuild/install.
- Before any new Nux build, verify this file, `AGENTS.md`, and `ThorVault/Projects/Nux.md` agree.
- If adding new features, make focused commits and keep the current known-good AppImage backup intact.
- If unsure, stop and ask Mazen before changing source state or installed app state.

## Durable External Note

ThorVault canonical project note:

```text
/home/mazen/Documents/ThorVault/Projects/Nux.md
```
