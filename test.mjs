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
const ROUTES_AREA = 'routes'
const SIDEBAR_NAV_AREA = 'sidebar.nav'
const IMESSAGE_GREEN = '#1e8449'
const AGENT_GREEN = '#dcecdc'
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
    `const Switch = () => null;
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
globalThis.__jsx = (type, config, ...children) => {
  // Mirror the real runtime: it reads config.key, so `null` props must throw
  // HERE, in the harness, exactly as it does in the app. A fake that ignored
  // props let `jsx(Comp, null)` pass 47 tests and crash the real page.
  if (config == null || typeof config !== 'object') {
    throw new TypeError(`Cannot read properties of ${config} (reading 'key')`)
  }
  const props = { ...config }
  delete props.key
  return { type, props, key: config.key ?? null, children: children.flat(Infinity).filter(c => c != null) }
}

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
ok('appearance page registered', registrations.some(r => r.area === ROUTES_AREA))
// The sidebar row was removed on purpose: the user asked for it to go.
ok('NO sidebar nav row', !registrations.some(r => r.area === SIDEBAR_NAV_AREA))

// iMessage pairing, not theme-following defaults.
ok('your bubble defaults to iMessage green', rootVars.get('--cb-user-fill') === IMESSAGE_GREEN,
   String(rootVars.get('--cb-user-fill')))
ok('agent bubble defaults to agent pale green', rootVars.get('--cb-agent-fill') === AGENT_GREEN,
   String(rootVars.get('--cb-agent-fill')))
ok('both fills are dense (100%)', rootVars.get('--cb-user-mix') === '100%' && rootVars.get('--cb-agent-mix') === '100%')
ok('3 palette commands', registrations.filter(r => r.area === 'palette').length === 3,
   String(registrations.filter(r => r.area === 'palette').length))

// defaults painted as CSS vars
ok('--cb-user-w = 68%', rootVars.get('--cb-user-w') === '68%', rootVars.get('--cb-user-w'))
ok('--cb-agent-w = 88%', rootVars.get('--cb-agent-w') === '88%', rootVars.get('--cb-agent-w'))
ok('--cb-radius = 18px', rootVars.get('--cb-radius') === '18px', rootVars.get('--cb-radius'))
ok('both colour overrides present by default', rootVars.has('--cb-user-fill') && rootVars.has('--cb-agent-fill'))
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
const pageReg = registrations.find(r => r.area === ROUTES_AREA)
ok('page render is a function', typeof pageReg.render === 'function')

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
ok('rejects numeric userColor 42 -> default green', g.userColor === IMESSAGE_GREEN, String(g.userColor))
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
ok('default userMix = 100%', rootVars.get('--cb-user-mix') === '100%', rootVars.get('--cb-user-mix'))
ok('default agentMix = 100%', rootVars.get('--cb-agent-mix') === '100%', rootVars.get('--cb-agent-mix'))

// Card render must not throw, and the component it returns must actually build.
// `render()` hands back an element whose `type` is the component — nothing
// inside it runs until React calls it, so the test calls it directly.
const card = registrations3.find(r => r.area === ROUTES_AREA)
ok('page render returns an element', !!card && typeof card.render === 'function')
try {
  // Call it the way React does — with a config object, key included.
  const el = card.render()
  ok('card render returns an element', !!el && typeof el.type === 'function')
  const page = el.type({ ...(el.props || {}), key: el.key ?? null })

  // Walk the tree, CALLING every component we meet, until a rendered body
  // carries the text we are looking for. A component is opaque until called —
  // that is why a plain JSON.stringify of the page finds none of the card's
  // labels: they live inside AppearanceCard's and Preview's bodies.
  const find = (node, needle, depth = 0) => {
    if (node == null || typeof node !== 'object' || depth > 40) return false
    if (Array.isArray(node)) return node.some(c => find(c, needle, depth + 1))
    if (typeof node === 'string') return node.includes(needle)
    if (typeof node.type === 'function') {
      let body = null
      try { body = node.type({ ...(node.props || {}), key: node.key ?? null }) } catch { return false }
      // The component's OWN body, and anything it renders, both count.
      if (JSON.stringify(body).includes(needle)) return true
      return find(body, needle, depth + 1)
    }
    return find(node.children, needle, depth + 1)
  }
  const tree = JSON.stringify(page)
  const count = re => (tree.match(re) || []).length + (find(page, 'Seguir el tema') ? 2 : 0)
  ok('card passes clearLabel to both swatch grids', find(page, 'Seguir el tema'), 'no encontrado en la pagina')
  ok('card exposes two intensity sliders', find(page, 'Intensidad de'), 'no encontrado')
  ok('card includes the live preview', find(page, 'Tu mensaje'), 'no encontrado')
  ok('preview renders both bubbles', find(page, 'Mensaje del agente'), 'no encontrado')
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
  ok('it navigates to our own page', navigations[0] === '/chat-bubbles', String(navigations[0]))
  ok('3 palette commands now', reg4.filter(r => r.area === 'palette').length === 3,
     String(reg4.filter(r => r.area === 'palette').length))
  // The old route is what made the row look inert; keep it out for good.
  ok('it does NOT navigate to the unreachable settings route',
     !String(navigations[0]).includes('/settings'), String(navigations[0]))
}

// The nav row was removed deliberately; the page is reachable from the palette.
const page = reg4.find(r => r.area === ROUTES_AREA)
ok('page is the only way in', !!page && !reg4.find(r => r.area === SIDEBAR_NAV_AREA))
ok('page has a path', typeof page?.data?.path === 'string' && page.data.path.startsWith('/'))

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