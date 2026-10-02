# Chat Bubbles for Hermes Desktop

iMessage-style chat bubbles for **every** Hermes Desktop session — yours on the
right, the agent's on the left — with a settings card in
**Settings → Appearance**.

A single-file desktop plugin. No core patch, so **Hermes updates never touch
it**.

![bubble chat](https://img.shields.io/badge/Hermes_Desktop-0.21.5%2B-8b5cf6?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![file](https://img.shields.io/badge/plugin-1%20file-ESM-orange?style=flat-square)
![deps](https://img.shields.io/badge/dependencies-none-success?style=flat-square)

---

## Why

In a Hermes transcript, your messages and the agent's read the same: same
block, same colour, same alignment. With long documents — code, tables,
reports — you can't tell at a glance who wrote what.

This puts them apart:

| | Side | Fill | Corner |
|---|---|---|---|
| **You** | right | accent-tinted | 18/18/18/5 |
| **Agent** | left | neutral surface | 18/18/5/18 |

Plus an iMessage-style "..." typing pill while the agent works, and an optional
quiet mode that hides thinking/tool/timer rows.

## Install

```bash
mkdir -p ~/.hermes/desktop-plugins/chat-bubbles
curl -fsSL https://raw.githubusercontent.com/Christianrhf/hermes-chat-bubbles/main/plugin.js \
  -o ~/.hermes/desktop-plugins/chat-bubbles/plugin.js
```

Then in Hermes Desktop: **⌘K → Reload desktop plugins** (or restart the app).

The folder **must** be named `chat-bubbles` — it has to match the plugin id.

## Development

```bash
node test.mjs
```

Runs the plugin against a fake DOM and a fake SDK: 29 assertions covering
registration, the settings card, config persistence, clamping of garbage
values, and a clean `dispose`. No dependencies, no build step.

## Settings

**⌘K → Chat Bubbles: open settings** opens the plugin's own page.

> **Heads-up:** the settings live on the plugin's own page, not in the app's
> Settings — **⌘K → Chat Bubbles: open settings**. The `appearance.extra` slot
> is unreachable by design: the app mounts it only when `subpage === undefined`,
> but `resolveSettingsSubpage` always returns a subpage (`general` when no
> `page=` is given) and `openSettingsPage` always writes `?page=`.

## The colours

| | Fill | Side | Corner |
|---|---|---|---|
| **You** | `#1e8449` — dark green | right | 18/18/18/5 |
| **Agent** | `#dcecdc` — pale green | left | 18/18/5/18 |

Your bubble is dark and saturated (luminance 0.17), the agent's is pale (7%
saturation) — that tonal gap is what separates them, and it separates *more*
than a grey would (190/255 vs 174/255 of channel difference). Contrast of the
text on top: 4.72 and 8.78, both AA.

A dense fill needs light ink: dark text on iMessage green scored 2.1, so the
plugin forces white text on your bubble via `--cb-user-ink`.

Earlier iterations were a theme-tinted accent vs a neutral grey, which was too
close on some themes — the complaint that started this.

| Control | Default | |
|---|---|---|
| Chat bubbles | on | master switch |
| Hide working rows | on | hides thinking, tool calls, timers |
| Your bubble width | 68% | slider 30–100 |
| Agent bubble width | 88% | slider 30–100 |
| Corner radius | 18px | slider 0–30 |
| Your bubble colour | dark green `#1e8449` | swatches; empty = follow theme |
| **Your bubble intensity** | 100% | slider 5–100 |
| Agent bubble colour | pale green `#dcecdc` | swatches; empty = follow theme |
| **Agent bubble intensity** | 100% | slider 5–100 |

A live preview of both bubbles sits above the controls, so you can see what a
setting does without going back to the conversation.

Three palette commands, all persisted:

- **⌘K → Chat Bubbles: open settings** (the plugin's page at `/chat-bubbles`)
- **⌘K → Chat Bubbles: toggle**
- **⌘K → Chat Bubbles: quiet working rows**

> **Where the card lives:** `appearance.extra` renders at the **end of the
> top-level Appearance page only** — the app gates it with
> `subpage === undefined`, and Appearance has six subpages (Chat Display among
> them). Use *open settings* rather than hunting for the subpage.

### Intensity is floored at 5%

`color-mix(hue N%, surface)` at `N = 0` is the pure surface, so the bubble
disappears into the page. The slider therefore starts at 5% — the lightest fill
that still reads as a bubble.

### Why "hide working rows" defaults to on

The upstream plugin ships it off, because Bot Chat is for conversation. This one
is for reading long documents, where a transcript full of `grep`/`Read`/timer
rows is unreadable again. **Approvals and "Message from X" chips are never
hidden** — those need a decision.

## How it works

Every control is a **CSS variable on `:root`**, not a stylesheet rebuild — the
card writes variables and the browser repaints:

```
--cb-user-w    --cb-agent-w    --cb-radius
--cb-user-fill --cb-agent-fill
--cb-user-mix  --cb-agent-mix
--cb-user-ink
```

An empty colour calls `removeProperty`, and the CSS falls back to the theme
token (`--ui-accent`, `--ui-bg-elevated`) — so switching your Hermes skin
recolours the bubbles on its own. The shipped defaults deliberately ignore the
theme (the two greens above), because a theme-derived tint was the original
complaint.

The settings page registers on the `routes` area at `/chat-bubbles` and reaches
the app through `ctx.register`. Its state goes in `ctx.storage`, so a bad value
from an older build self-heals on load instead of being re-clamped forever.

> `ROUTES_AREA` is **not** exported from `@hermes/plugin-sdk` (it lives in
> `app/routes.ts`). Importing it yields `undefined` and the contribution
> registers under the literal string `"undefined"`, which no slot consumes —
> declare it as a plain string.

## Troubleshooting

**Open it with ⌘K → Chat Bubbles: open settings.** There is deliberately no
sidebar row — one clear way in beats a permanent entry.

The card mounts on the plugin's own page at `/chat-bubbles`, not in the app's
Settings. There is no plugin area in Settings to hook, and the one official
seam (`appearance.extra`) is unreachable — see the note above.

**The palette rows are missing.** Press **⌘K → Reload desktop plugins**. The
stylesheet and the palette rows come from the same file, so an app that has not
reloaded shows both together — or neither. If a reload doesn't help, restart
the app: the command palette reads the contribution registry once at mount.

**The page renders "failed to render" / "Cannot read properties of null
(reading 'key')".** You are running a build where a component was called as
`jsx(Comp, null)`. The React runtime reads `config.key` off the props object,
so `null` throws. Reload the plugin from the fixed version.

**A future Hermes release renames a `data-slot`.** The bubbles quietly stop
applying and nothing breaks — the settings card, the toggles and your saved
values keep working, because those live in `ctx.storage`, not in the CSS.

### Cards keep their stock chrome

An `.aui-md` containing a code card, table, `pre` or `[data-streamdown]` goes
full-width with no bubble; its bare prose siblings still get one. A code block
should read as a code block, not as one more box.

## Credits & license

Bubble CSS adapted from
[thomasbek3/hermes-bot-kit](https://github.com/thomasbek3/hermes-bot-kit)
`bubble-mode` (MIT, v2026.09.12) — which only styles the per-bot "Bot Chat" of
Bot Mode, so it does nothing in a normal session. This plugin removes that gate,
retunes the palette for light and dark, and adds the settings card.

MIT.