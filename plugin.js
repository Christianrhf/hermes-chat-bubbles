/**
 * Chat Bubbles — iMessage-style bubbles for every Hermes Desktop chat, with a
 * settings card in Settings → Appearance.
 *
 * Derived from thomasbek3/hermes-bot-kit `bubble-mode` (MIT, v2026.09.12):
 * the bubble CSS is reused, but that plugin only styles a per-bot "Bot Chat",
 * so in a normal session it loads and does nothing. Here the body class is
 * driven purely by the on/off toggle and the config below, so the same bubbles
 * land on every session transcript.
 *
 * Lives in ~/.hermes/desktop-plugins/chat-bubbles/plugin.js — a plain ESM file
 * the app loads at runtime. No core patch, so Hermes updates never touch it.
 * Everything is CSS on stable `data-slot` hooks; if a future release renames a
 * hook the bubbles quietly stop applying and nothing breaks.
 */

import {
  APPEARANCE_AREAS,
  Switch,
  ColorSwatches,
  PROFILE_SWATCHES,
  atom,
  useValue,
  host
} from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'

const PLUGIN_ID = 'chat-bubbles'
const STYLE_ID = 'hermes-chat-bubbles-style'
const BODY_CLASS = 'hermes-chat-bubbles'
const QUIET_CLASS = 'hermes-chat-bubbles-quiet'
const CFG_KEY = 'config'

const DEFAULTS = {
  enabled: true,
  quiet: true,
  userWidth: 68,
  agentWidth: 88,
  radius: 18,
  // null = follow the theme. userColor/agentColor are base hues; userMix and
  // agentMix are how much of that hue is mixed into the surface — the
  // darken/lighten lever.
  userColor: null,
  agentColor: null,
  userMix: 15,
  agentMix: 62
}

const clamp = (n, lo, hi, fallback) => {
  const v = Number(n)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback
}

function normalize(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: c.enabled !== false,
    quiet: c.quiet !== false,
    userWidth: clamp(c.userWidth, 30, 100, DEFAULTS.userWidth),
    agentWidth: clamp(c.agentWidth, 30, 100, DEFAULTS.agentWidth),
    radius: clamp(c.radius, 0, 30, DEFAULTS.radius),
    userColor: typeof c.userColor === 'string' ? c.userColor : DEFAULTS.userColor,
    agentColor: typeof c.agentColor === 'string' ? c.agentColor : DEFAULTS.agentColor,
    userMix: clamp(c.userMix, 5, 100, DEFAULTS.userMix),
    agentMix: clamp(c.agentMix, 5, 100, DEFAULTS.agentMix)
  }
}

const $config = atom(normalize(null))

// Cards and code keep stock chrome and full width; only prose gets a bubble.
const CARDY =
  '[data-slot="code-card"], [data-slot="aui_artifact-card"], [data-slot="aui_embed-card"], ' +
  '[data-slot="aui_changed-files"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-image"], ' +
  '[data-slot="aui_listing-card"], [data-slot="aui_listing-gallery"], [data-streamdown], pre, table, .aui-md-table'

// Anything that is one of those, or merely CONTAINS one.
const NOT_CARDY =
  ':not(pre):not(table):not(hr):not(.aui-md-table)' +
  ':not([data-slot="code-card"]):not([data-slot="aui_artifact-card"]):not([data-slot="aui_embed-card"])' +
  ':not([data-slot="aui_changed-files"]):not([data-slot="aui_generated-image"]):not([data-slot="aui_markdown-image"])' +
  ':not([data-slot="aui_listing-card"]):not([data-slot="aui_listing-gallery"]):not([data-streamdown])' +
  ':not(:has(pre, table, .aui-md-table, [data-slot="code-card"], [data-slot="aui_artifact-card"], ' +
  '[data-slot="aui_embed-card"], [data-slot="aui_changed-files"], [data-slot="aui_generated-image"], ' +
  '[data-slot="aui_listing-card"]))'

// Every knob the settings card owns is a CSS variable, so the card repaints the
// transcript by writing variables — never by rebuilding the stylesheet.
const PLUGIN_CSS = /* css */ `
/* ── You: right-aligned, accent-tinted, rounded on three corners ─────────── */

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"]:not(:has(textarea, [contenteditable="true"], input)) {
  align-items: flex-end;
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"] .composer-human-message:not(:has(textarea, [contenteditable="true"], input)) {
  box-sizing: border-box;
  width: fit-content;
  max-width: min(var(--cb-user-w, 68%), 44rem);
  margin-left: auto;
  padding: var(--cb-pad-y, 0.5rem) var(--cb-pad-x, 0.875rem);
  border: 1px solid color-mix(in srgb, var(--cb-user-fill, var(--ui-accent)) 30%, transparent);
  border-radius: var(--cb-radius, 18px) var(--cb-radius, 18px) var(--cb-radius, 18px) calc(var(--cb-radius, 18px) * 0.28);
  background: color-mix(in srgb, var(--cb-user-fill, var(--ui-accent)) var(--cb-user-mix, 15%), var(--ui-bg-editor, #ffffff));
  box-shadow: none;
}

/* Text/code inside your bubble must not fight the bubble's own colour. */
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"] .composer-human-message [data-slot="aui_user-message-text"],
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"] .composer-human-message [data-slot="aui_user-inline-text"] {
  color: inherit;
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"] .composer-human-message [data-slot="aui_user-inline-code"] {
  background: color-mix(in srgb, currentColor 16%, transparent);
  color: inherit;
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_user-message-root"] .composer-human-message svg {
  color: var(--ui-text-secondary, inherit);
}

/* ── Me: left-aligned, neutral fill, rounded on the other three corners ───── */

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md {
  box-sizing: border-box;
  width: fit-content;
  max-width: min(var(--cb-agent-w, 88%), 54rem);
  padding: var(--cb-pad-y, 0.5rem) var(--cb-pad-x, 0.875rem);
  border: 1px solid color-mix(in srgb, var(--ui-stroke-tertiary, #8888) 70%, transparent);
  border-radius: var(--cb-radius, 18px) var(--cb-radius, 18px) calc(var(--cb-radius, 18px) * 0.28) var(--cb-radius, 18px);
  background: color-mix(in srgb, var(--cb-agent-fill, var(--ui-bg-elevated)) var(--cb-agent-mix, 62%), transparent);
}

/* A reply that carries a card keeps full width; its bare prose children get
   their own bubbles so the "who said this" signal survives the card. */
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md:has(${CARDY}) {
  width: 100%;
  max-width: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md:has(${CARDY}) > ${NOT_CARDY} {
  box-sizing: border-box;
  width: fit-content;
  max-width: min(var(--cb-agent-w, 88%), 54rem);
  padding: calc(var(--cb-pad-y, 0.5rem) * 0.7) calc(var(--cb-pad-x, 0.875rem) * 0.9);
  border: 1px solid color-mix(in srgb, var(--ui-stroke-tertiary, #8888) 70%, transparent);
  border-radius: calc(var(--cb-radius, 18px) * 0.9) calc(var(--cb-radius, 18px) * 0.9) calc(var(--cb-radius, 18px) * 0.28) calc(var(--cb-radius, 18px) * 0.9);
  background: color-mix(in srgb, var(--cb-agent-fill, var(--ui-bg-elevated)) var(--cb-agent-mix, 62%), transparent);
}

/* Never paint a bubble around the empty container that precedes the typing
   indicator, nor around an inline element with no box of its own. */
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md:not(:has(:not(:empty))),
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md > span:empty,
body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_assistant-message-content"] > .aui-md > br {
  background: transparent;
  padding: 0;
  border: none;
  margin: 0;
}

/* ── Typing indicator: "..." pill where my reply will land ───────────────── */

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_response-loading"] {
  box-sizing: border-box;
  width: fit-content;
  padding: 0.7rem 0.8rem;
  border-radius: calc(var(--cb-radius, 18px) * 0.9);
  background: color-mix(in srgb, var(--cb-agent-fill, var(--ui-bg-elevated)) var(--cb-agent-mix, 62%), transparent);
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_response-loading"] > * {
  display: none;
}

body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_response-loading"]::after {
  content: '';
  display: block;
  width: 6px;
  height: 6px;
  margin-right: 20px;
  border-radius: 50%;
  background: var(--ui-text-secondary, #b9b9bf);
  box-shadow: 10px 0 0 var(--ui-text-tertiary, #6b6b70), 20px 0 0 var(--ui-text-tertiary, #6b6b70);
  animation: hermes-chat-bubbles-typing 1.2s infinite ease-in-out;
}

@keyframes hermes-chat-bubbles-typing {
  0%, 90%, 100% {
    background: var(--ui-text-secondary, #b9b9bf);
    box-shadow: 10px 0 0 var(--ui-text-tertiary, #6b6b70), 20px 0 0 var(--ui-text-tertiary, #6b6b70);
  }
  30% {
    background: var(--ui-text-tertiary, #6b6b70);
    box-shadow: 10px 0 0 var(--ui-text-secondary, #b9b9bf), 20px 0 0 var(--ui-text-secondary, #b9b9bf);
  }
  60% {
    background: var(--ui-text-tertiary, #6b6b70);
    box-shadow: 10px 0 0 var(--ui-text-secondary, #b9b9bf), 20px 0 0 var(--ui-text-secondary, #b9b9bf);
  }
}

/* ── Quiet chat: hide the working noise. Approvals and agent-to-agent chips
      are never hidden. ────────────────────────────────────────────────────── */

body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_thinking-disclosure"],
body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_thinking-body"],
body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_reasoning-text"],
body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_turn-activity"],
body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_turn-duration"] {
  display: none;
}

body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="tool-block"]:not(:has([data-slot="tool-approval-card"])):not(:has([data-slot="tool-approval-actions"])):not(:has([data-slot="tool-approval-stack"])) {
  display: none;
}

/* A user-slot row holding a collapsible <details> and no bubble is an injected
   background-process notice, not something the user typed. */
body.hermes-chat-bubbles-quiet [data-chat-surface] [data-slot="aui_user-message-root"]:has(details):not(:has([data-slot="aui_agent-message-note"])):not(:has(.composer-human-message)) {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  body.hermes-chat-bubbles [data-chat-surface] [data-slot="aui_response-loading"]::after {
    animation: none;
  }
}
`

let pluginCtx = null

function injectStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = PLUGIN_CSS
  ;(document.head || document.documentElement).appendChild(el)
}

function removeStyle() {
  if (typeof document === 'undefined') return
  document.getElementById(STYLE_ID)?.remove()
}

/** Paint the current config: body classes + one CSS variable per knob. */
function apply(cfg) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const on = Boolean(cfg.enabled)

  if (document.body) {
    document.body.classList.toggle(BODY_CLASS, on)
    document.body.classList.toggle(QUIET_CLASS, Boolean(on && cfg.quiet))
  }

  if (!on) {
    for (const k of ['--cb-user-w', '--cb-agent-w', '--cb-radius', '--cb-user-fill', '--cb-user-mix', '--cb-agent-fill', '--cb-agent-mix']) {
      root.style.removeProperty(k)
    }
    return
  }

  root.style.setProperty('--cb-user-w', `${cfg.userWidth}%`)
  root.style.setProperty('--cb-agent-w', `${cfg.agentWidth}%`)
  root.style.setProperty('--cb-radius', `${cfg.radius}px`)
  root.style.setProperty('--cb-user-mix', `${cfg.userMix}%`)
  root.style.setProperty('--cb-agent-mix', `${cfg.agentMix}%`)
  // A null colour removes the override so the CSS falls back to the theme token.
  if (cfg.userColor) root.style.setProperty('--cb-user-fill', cfg.userColor)
  else root.style.removeProperty('--cb-user-fill')
  if (cfg.agentColor) root.style.setProperty('--cb-agent-fill', cfg.agentColor)
  else root.style.removeProperty('--cb-agent-fill')
}

function commit(patch) {
  const next = normalize({ ...$config.get(), ...patch })
  $config.set(next)
  apply(next)
  try {
    pluginCtx?.storage?.set?.(CFG_KEY, next)
  } catch {
    /* storage unavailable — holds for this window */
  }
}

/** Write back when storage held something normalize() had to repair, so a bad
 *  value from an older build self-heals instead of being re-clamped forever. */
function healStorage(cfg, raw) {
  if (!raw) return
  const keys = Object.keys(cfg)
  const same =
    raw &&
    typeof raw === 'object' &&
    keys.length === Object.keys(raw).length &&
    keys.every(k => raw[k] === cfg[k])
  if (same) return
  try {
    pluginCtx?.storage?.set?.(CFG_KEY, cfg)
  } catch {
    /* storage unavailable — the in-memory config still stands */
  }
}

function toggleEnabled() {
  commit({ enabled: !$config.get().enabled })
}

function toggleQuiet() {
  commit({ quiet: !$config.get().quiet })
}

// ── Settings → Appearance card ────────────────────────────────────────────

function Row({ label, hint, control }) {
  return jsx(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.5rem 0'
      }
    },
    jsx(
      'div',
      { style: { minWidth: 0 } },
      jsx('div', { style: { fontSize: '0.8125rem', color: 'var(--ui-text-primary)' } }, label),
      hint
        ? jsx(
            'div',
            {
              style: {
                fontSize: '0.72rem',
                color: 'var(--ui-text-tertiary)',
                marginTop: '0.125rem'
              }
            },
            hint
          )
        : null
    ),
    jsx('div', { style: { flexShrink: 0 } }, control)
  )
}

function Slider({ value, min, max, step = 1, suffix = '%', ariaLabel, onChange }) {
  return jsx(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
    jsx('input', {
      type: 'range',
      min,
      max,
      step,
      value,
      'aria-label': ariaLabel || suffix,
      onChange: e => onChange(Number(e.target.value)),
      style: { width: '8rem', accentColor: 'var(--ui-accent)' }
    }),
    jsx(
      'span',
      {
        style: {
          fontSize: '0.75rem',
          color: 'var(--ui-text-secondary)',
          minWidth: '2.75rem',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums'
        }
      },
      `${value}${suffix}`
    )
  )
}

/**
 * A live preview of both bubbles at the current settings. Without it the
 * colour and intensity controls are abstract — you cannot see what "82%" means
 * until you go back to the conversation.
 */
function Preview({ userColor, userMix, agentColor, agentMix, radius, userWidth, agentWidth }) {
  const paint = (color, mix, width, r, side) => ({
    boxSizing: 'border-box',
    width: 'fit-content',
    maxWidth: `${width}%`,
    marginLeft: side === 'end' ? 'auto' : undefined,
    padding: '0.4rem 0.7rem',
    border: '1px solid color-mix(in srgb, var(--ui-stroke-tertiary, #8888) 70%, transparent)',
    borderRadius:
      side === 'end'
        ? `${r}px ${r}px ${r}px ${Math.round(r * 0.28)}px`
        : `${r}px ${r}px ${Math.round(r * 0.28)}px ${r}px`,
    background: color
      ? `color-mix(in srgb, ${color} ${mix}%, var(--ui-bg-editor))`
      : `color-mix(in srgb, var(--ui-accent) ${mix}%, var(--ui-bg-editor))`,
    fontSize: '0.75rem',
    color: 'var(--ui-text-primary)'
  })

  return jsx(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        padding: '0.75rem',
        margin: '0.25rem 0 0.5rem',
        borderRadius: '0.75rem',
        background: 'var(--ui-bg-editor)',
        border: '1px solid var(--ui-stroke-tertiary)'
      }
    },
    jsx(
      'div',
      { style: { display: 'flex', justifyContent: 'flex-end' } },
      jsx('div', { style: paint(userColor, userMix, userWidth, radius, 'end') }, 'Tu mensaje')
    ),
    jsx(
      'div',
      { style: { display: 'flex', justifyContent: 'flex-start' } },
      jsx(
        'div',
        { style: paint(agentColor, agentMix, agentWidth, radius, 'start') },
        'Mensaje del agente'
      )
    )
  )
}

function AppearanceCard() {
  const cfg = useValue($config)

  const reset = () => commit({ ...DEFAULTS, enabled: cfg.enabled, quiet: cfg.quiet })

  return jsx(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '0.125rem' } },
    jsx(Row, {
      label: 'Burbujas de chat',
      hint: 'Tus mensajes a la derecha, los del agente a la izquierda.',
      control: jsx(Switch, {
        checked: cfg.enabled,
        onCheckedChange: v => commit({ enabled: Boolean(v) })
      })
    }),
    jsx(Row, {
      label: 'Ocultar trabajo',
      hint: 'Esconde pensamiento, herramientas y temporizadores. Las aprobaciones y los mensajes entre agentes siguen visibles.',
      control: jsx(Switch, {
        checked: cfg.quiet,
        onCheckedChange: v => commit({ quiet: Boolean(v) })
      })
    }),
    jsx(Preview, {
      userColor: cfg.userColor,
      userMix: cfg.userMix,
      agentColor: cfg.agentColor,
      agentMix: cfg.agentMix,
      radius: cfg.radius,
      userWidth: cfg.userWidth,
      agentWidth: cfg.agentWidth
    }),
    jsx(Row, {
      label: 'Ancho de tus burbujas',
      control: jsx(Slider, {
        value: cfg.userWidth,
        min: 30,
        max: 100,
        ariaLabel: 'Ancho de tus burbujas',
        onChange: v => commit({ userWidth: v })
      })
    }),
    jsx(Row, {
      label: 'Ancho de las del agente',
      control: jsx(Slider, {
        value: cfg.agentWidth,
        min: 30,
        max: 100,
        ariaLabel: 'Ancho de las burbujas del agente',
        onChange: v => commit({ agentWidth: v })
      })
    }),
    jsx(Row, {
      label: 'Redondeo',
      control: jsx(Slider, {
        value: cfg.radius,
        min: 0,
        max: 30,
        suffix: 'px',
        ariaLabel: 'Redondeo de las esquinas',
        onChange: v => commit({ radius: v })
      })
    }),
    jsx(
      'div',
      { style: { fontSize: '0.72rem', color: 'var(--ui-text-tertiary)', padding: '0.75rem 0 0.25rem' } },
      'COLOR DE TUS BURBUJAS'
    ),
    jsx(ColorSwatches, {
      swatches: PROFILE_SWATCHES,
      value: cfg.userColor,
      clearLabel: 'Seguir el tema',
      swatchLabel: c => `Color ${c}`,
      onChange: c => commit({ userColor: c })
    }),
    jsx(Row, {
      label: 'Intensidad',
      hint: '5% es lo más claro que se distingue del fondo; 100%, el color pleno.',
      control: jsx(Slider, {
        value: cfg.userMix,
        min: 5,
        max: 100,
        ariaLabel: 'Intensidad de tus burbujas',
        onChange: v => commit({ userMix: v })
      })
    }),
    jsx(
      'div',
      { style: { fontSize: '0.72rem', color: 'var(--ui-text-tertiary)', padding: '0.75rem 0 0.25rem' } },
      'COLOR DE LAS BURBUJAS DEL AGENTE'
    ),
    jsx(ColorSwatches, {
      swatches: PROFILE_SWATCHES,
      value: cfg.agentColor,
      clearLabel: 'Seguir el tema',
      swatchLabel: c => `Color ${c}`,
      onChange: c => commit({ agentColor: c })
    }),
    jsx(Row, {
      label: 'Intensidad',
      hint: '5% es lo más claro que se distingue del fondo; 100%, el color pleno.',
      control: jsx(Slider, {
        value: cfg.agentMix,
        min: 5,
        max: 100,
        ariaLabel: 'Intensidad de las burbujas del agente',
        onChange: v => commit({ agentMix: v })
      })
    }),
    jsx(
      'div',
      { style: { paddingTop: '0.75rem' } },
      jsx(
        'button',
        {
          type: 'button',
          onClick: reset,
          style: {
            fontSize: '0.75rem',
            color: 'var(--ui-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--ui-stroke-tertiary)',
            borderRadius: '0.5rem',
            padding: '0.25rem 0.625rem',
            cursor: 'pointer'
          }
        },
        'Restablecer anchos y colores'
      )
    )
  )
}

function dispose() {
  if (typeof document === 'undefined') return
  document.body?.classList.remove(BODY_CLASS, QUIET_CLASS)
  const root = document.documentElement
  for (const k of ['--cb-user-w', '--cb-agent-w', '--cb-radius', '--cb-user-fill', '--cb-user-mix', '--cb-agent-fill', '--cb-agent-mix']) {
    root.style.removeProperty(k)
  }
  removeStyle()
}

export { Preview }

export default {
  id: PLUGIN_ID,
  name: 'Chat Bubbles',
  defaultEnabled: true,
  description: 'iMessage-style bubbles on every chat, configurable from Settings → Appearance.',
  register(ctx) {
    pluginCtx = ctx

    let initial = normalize(null)
    let storedRaw = null
    try {
      const stored = ctx.storage?.get?.(CFG_KEY, null)
      if (stored && typeof stored.then === 'function') {
        stored
          .then(resolved => {
            initial = normalize(resolved)
            storedRaw = resolved
            $config.set(initial)
            apply(initial)
            healStorage(initial, resolved)
          })
          .catch(() => undefined)
      } else if (stored) {
        storedRaw = stored
        initial = normalize(stored)
      }
    } catch {
      /* storage unavailable — defaults stand */
    }

    $config.set(initial)
    injectStyle()
    apply(initial)
    healStorage(initial, storedRaw)

    ctx.register({
      id: 'appearance-card',
      area: APPEARANCE_AREAS.extra,
      render: () => jsx(AppearanceCard, null)
    })

    // The card only mounts on the TOP-LEVEL Appearance page — the app gates it
    // with `subpage === undefined`, and Appearance has six subpages (Chat
    // Display among them). So give the user a command that lands on the page
    // itself instead of making them hunt for it.
    ctx.register({
      id: 'palette-open-settings',
      area: 'palette',
      data: {
        id: `${PLUGIN_ID}.openSettings`,
        label: 'Chat Bubbles: open settings',
        keywords: ['settings', 'apariencia', 'appearance', 'config', 'ajustes', 'panel'],
        detail: () => 'Settings → Appearance',
        run: () => {
          try {
            // The tab id is `config:appearance`, NOT `appearance`: the settings
            // tabs are `config:<section>` ids, and `useRouteEnumParam` silently
            // coerces an unknown tab to the default view — which is why this
            // row looked like it did nothing.
            host.navigate('/settings?tab=config:appearance')
          } catch {
            /* router unavailable — the card is still at Appearance's end */
          }
        }
      }
    })

    ctx.register({
      id: 'palette-toggle',
      area: 'palette',
      data: {
        id: `${PLUGIN_ID}.toggle`,
        label: 'Chat Bubbles: toggle',
        keywords: ['bubble', 'imessage', 'chat', 'style', 'bubbles', 'align'],
        detail: () => ($config.get().enabled ? 'on' : 'off'),
        detailVariant: 'state',
        keepOpen: true,
        run: toggleEnabled
      }
    })

    ctx.register({
      id: 'palette-toggle-quiet',
      area: 'palette',
      data: {
        id: `${PLUGIN_ID}.toggleQuiet`,
        label: 'Chat Bubbles: quiet working rows',
        keywords: ['quiet', 'thinking', 'tools', 'noise', 'hide', 'work rows'],
        detail: () => ($config.get().quiet ? 'hidden' : 'shown'),
        detailVariant: 'state',
        keepOpen: true,
        run: toggleQuiet
      }
    })

    if (typeof ctx.onDispose === 'function') ctx.onDispose(dispose)
  }
}