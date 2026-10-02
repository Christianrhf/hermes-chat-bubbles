// Harness: run chat-bubbles/plugin.js against fake DOM + fake SDK, then assert
// registration, the Appearance card, config persistence, CSS variables, quiet
// mode and dispose.
import { readFileSync } from 'node:fs'

const SRC = process.argv[2] || './plugin.js'
const src = readFileSync(SRC, 'utf8')

// ---- fake DOM ------------------------------------------------------------
const classes = new Set()
const styleEls = []
const rootVars = new Map()
const listeners = []
const documentElement = {
  style: {
    setProperty: (k, v) => rootVars.set(k, v),
    removeProperty: k => rootVars.delete(k)
  }
}
globalThis.document = {
  body: {
    classList: {
      add: c => classes.add(c),
      remove: (...cs) => cs.forEach(c => classes.delete(c)),
      contains: c => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
    }
  },
  head: { children: [], appendChild(el) { this.children.push(el) } },
  documentElement,
  createElement: tag => {
    const el = { tagName: tag, id: '', textContent: '', remove() { styleEls.splice(styleEls.indexOf(el), 1) } }
    if (tag === 'style') styleEls.push(el)
    return el
  },
  getElementById: id => styleEls.find(e => e.id === id) || null
}

// ---- fake SDK ------------------------------------------------------------
const APPEARANCE_AREAS = { extra: 'appearance.extra' }
const PROFILE_SWATCHES = ['#ff0000', '#00ff00', '#0000ff']
const navigations = []
const host = { navigate: to => navigations.push(to) }
const subscriptions = []

const atom = initial => {
  let value = initial
  const subs = new Set()
  return {
    get: () => value,
    set: v => { value = v; subs.forEach(f => f(v)) },
    subscribe: f => { subs.add(f); listeners.push(() => subs.delete(f)); return () => subs.delete(f) }
  }
}
const useValue = a => a.get()
const Switch = () => null
const ColorSwatches = () => null

const patched = src
  .replace(
    /import\s*\{[\s\S]*?\}\s*from\s*'@hermes\/plugin-sdk'/,
    `const APPEARANCE_AREAS = ${JSON.stringify(APPEARANCE_AREAS)};
const Switch = () => null;
const ColorSwatches = () => null;
const PROFILE_SWATCHES = ${JSON.stringify(PROFILE_SWATCHES)};
const host = globalThis.__host;
const atom = globalThis.__atom;
const useValue = globalThis.__useValue;`
  )
  .replace("import { jsx } from 'react/jsx-runtime'", 'const jsx = globalThis.__jsx;')

if (patched === src) throw new Error('patch anchors not found')

globalThis.__host = host

globalThis.__atom = atom
globalThis.__useValue = useValue
// jsx(type, props, ...children) -> a plain tree object
globalThis.__jsx = (type, props, ...children) => ({ type, props, children: children.flat(Infinity).filter(c => c != null) })

const mod = await import(`data:text/javascript;base64,${Buffer.from(patched).toString('base64')}`)
const plugin = mod.default
const Preview = mod.Preview

// ---- run -----------------------------------------------------------------
const store = new Map()
const registrations = []
const ctx = {
  storage: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
  register: r => registrations.push(r),
  onDispose: fn => { ctx._dispose = fn }
}

plugin.register(ctx)

const R = []
const ok = (label, cond, extra = '') => R.push({ label, pass: !!cond, extra })
const cfg = () => store.get('config')

ok('id = chat-bubbles', plugin.id === 'chat-bubbles')
ok('defaultEnabled true', plugin.defaultEnabled === true)
ok('<style> injected', styleEls.length === 1)
ok('body class on', classes.has('hermes-chat-bubbles'))
ok('quiet class on (default)', classes.has('hermes-chat-bubbles-quiet'))
ok('appearance card registered', registrations.some(r => r.area === APPEARANCE_AREAS.extra))
ok('3 palette commands', registrations.filter(r => r.area === 'palette').length === 3,
   String(registrations.filter(r => r.area === 'palette').length))

// defaults painted as CSS vars
ok('--cb-user-w = 68%', rootVars.get('--cb-user-w') === '68%', rootVars.get('--cb-user-w'))
ok('--cb-agent-w = 88%', rootVars.get('--cb-agent-w') === '88%', rootVars.get('--cb-agent-w'))
ok('--cb-radius = 18px', rootVars.get('--cb-radius') === '18px', rootVars.get('--cb-radius'))
ok('no colour override by default', !rootVars.has('--cb-user-fill') && !rootVars.has('--cb-agent-fill'))
ok('no write on first boot (defaults only)', cfg() === undefined)

// drive the card's commit path through the palette row (same code path)
const toggleOff = registrations.find(r => r.data?.id === 'chat-bubbles.toggle')
toggleOff.data.run()
ok('toggle off: class removed', !classes.has('hermes-chat-bubbles'))
ok('toggle off: vars cleared', !rootVars.has('--cb-user-w'))
ok('toggle off: persisted', cfg().enabled === false)
ok('toggle off: detail reads off', toggleOff.data.detail() === 'off')
toggleOff.data.run()
ok('toggle on again', classes.has('hermes-chat-bubbles') && rootVars.get('--cb-user-w') === '68%')

const quietRow = registrations.find(r => r.data?.id === 'chat-bubbles.toggleQuiet')
quietRow.data.run()
ok('quiet off: class removed', !classes.has('hermes-chat-bubbles-quiet'))
ok('quiet off: persisted', cfg().quiet === false)
quietRow.data.run()
ok('quiet back on', classes.has('hermes-chat-bubbles-quiet'))

// colour override round-trip
const colorCard = registrations.find(r => r.area === APPEARANCE_AREAS.extra)
ok('card render is a function', typeof colorCard.render === 'function')

// Garbage in storage must be clamped, not trusted: a re-register reads it back.
ctx.storage.set('config', { enabled: true, quiet: true, userWidth: 9999, agentWidth: -5, radius: 'x', userColor: 42 })
const registrations2 = []
const ctx2 = {
  storage: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) },
  register: r => registrations2.push(r),
  onDispose: fn => { ctx2._dispose = fn }
}
plugin.register(ctx2)
const g = cfg()
ok('clamps userWidth 9999 -> 100', g.userWidth === 100, String(g.userWidth))
ok('clamps agentWidth -5 -> 30', g.agentWidth === 30, String(g.agentWidth))
ok('rejects non-numeric radius -> default 18', g.radius === 18, String(g.radius))
ok('rejects numeric userColor 42 -> null', g.userColor === null, String(g.userColor))
ok('painted clamped var', rootVars.get('--cb-user-w') === '100%', rootVars.get('--cb-user-w'))

// New knobs: intensity (the darken/lighten lever) must reach the CSS.
ctx2._dispose?.()
const registrations3 = []
const ctx3 = {
  storage: { get: () => null, set: () => {} },
  register: r => registrations3.push(r),
  onDispose: fn => { ctx3._dispose = fn }
}
plugin.register(ctx3)
ok('default userMix = 15%', rootVars.get('--cb-user-mix') === '15%', rootVars.get('--cb-user-mix'))
ok('default agentMix = 62%', rootVars.get('--cb-agent-mix') === '62%', rootVars.get('--cb-agent-mix'))

// Card render must not throw, and the component it returns must actually build.
// `render()` hands back an element whose `type` is the component — nothing
// inside it runs until React calls it, so the test calls it directly.
const card = registrations3.find(r => r.area === APPEARANCE_AREAS.extra)
try {
  const el = card.render()
  ok('card render returns an element', !!el && typeof el.type === 'function')
  const tree0 = el.type(el.props)
  const tree = JSON.stringify(tree0)
  const count = re => (tree.match(re) || []).length
  ok('card passes clearLabel to both swatch grids', count(/Seguir el tema/g) === 2, String(count(/Seguir el tema/g)))
  ok('card exposes two intensity sliders', count(/Intensidad de/g) === 2, String(count(/Intensidad de/g)))
  ok('card includes the live preview', (() => {
    // <Preview> is itself a component: its body only exists once called.
    const findPreview = node => {
      if (!node || typeof node !== 'object') return null
      if (Array.isArray(node)) {
        for (const c of node) { const hit = findPreview(c); if (hit) return hit }
        return null
      }
      if (node.type === Preview) return node
      return findPreview(node.children)
    }
    const p = findPreview(tree0)
    if (!p) return false
    const rendered = JSON.stringify(p.type(p.props))
    return rendered.includes('Tu mensaje') && rendered.includes('Mensaje del agente')
  })())
} catch (e) {
  ok('card renders without throwing', false, String(e && e.message))
}

ctx3._dispose()

// The card only mounts on the top-level Appearance page, so there must be a way
// to get there: a palette command that navigates to the settings route.
const reg4 = []
const ctx4 = {
  storage: { get: () => null, set: () => {} },
  register: r => reg4.push(r),
  onDispose: () => {}
}
plugin.register(ctx4)
const openRow = reg4.find(r => r.data?.id === 'chat-bubbles.openSettings')
ok('open-settings command exists', !!openRow)
if (openRow) {
  navigations.length = 0
  openRow.data.run()
  ok('it navigates to the appearance tab', navigations[0] === '/settings?tab=config:appearance', String(navigations[0]))
  ok('3 palette commands now', reg4.filter(r => r.area === 'palette').length === 3,
     String(reg4.filter(r => r.area === 'palette').length))
}

// Intensity must never be able to make a bubble vanish: min 5%, not 0.
const store4 = new Map([['config', { enabled: true, quiet: true, userMix: 0, agentMix: 0 }]])
const reg5 = []
const ctx5 = {
  storage: { get: (k, d) => (store4.has(k) ? store4.get(k) : d), set: (k, v) => store4.set(k, v) },
  register: r => reg5.push(r),
  onDispose: () => {}
}
plugin.register(ctx5)
ok('intensity 0 clamps to 5%', rootVars.get('--cb-user-mix') === '5%', rootVars.get('--cb-user-mix'))
ok('agent intensity 0 clamps to 5%', rootVars.get('--cb-agent-mix') === '5%', rootVars.get('--cb-agent-mix'))
ctx5.onDispose && ctx5.onDispose()

// dispose, from a clean register
const reg6 = []
const ctx6 = {
  storage: { get: () => null, set: () => {} },
  register: r => reg6.push(r),
  onDispose: fn => { ctx6._dispose = fn }
}
plugin.register(ctx6)
ok('registered: style present', styleEls.length === 1)
ctx6._dispose()
ok('dispose clears body classes', !classes.has('hermes-chat-bubbles') && !classes.has('hermes-chat-bubbles-quiet'))
ok('dispose clears every var', rootVars.size === 0, [...rootVars.keys()].join(','))
ok('dispose removes <style>', styleEls.length === 0)

for (const r of R) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.label}${r.extra ? ' — ' + r.extra : ''}`)
const bad = R.filter(r => !r.pass).length
console.log(`\n${R.length - bad}/${R.length} passed`)
process.exit(bad ? 1 : 0)