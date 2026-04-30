<template>
  <canvas ref="canvasEl" style="display:block;width:100%;height:100%;background:#000" />
</template>

<script setup lang="ts">
import type { HydraBandValues, TimeColorTint } from '~/utils/hydra/types'
import type { GlslPatch } from '~/utils/glsl/types'
import type { PitchAnalysisResult } from '~/utils/audio/types'

const props = defineProps<{
  patch: GlslPatch
  bands: HydraBandValues
  reloadToken?: number
}>()

const { public: { deviceProfile } } = useRuntimeConfig()
const isRaspberry = deviceProfile === 'raspberry'

const canvasEl = ref<HTMLCanvasElement | null>(null)
const colorTint = inject<Ref<TimeColorTint> | null>('timeColorTint', null)

// ── Typed uniform locations ────────────────────────────────────────────────────
type ULocs = {
  prev:          WebGLUniformLocation | null
  logo:          WebGLUniformLocation | null
  Lv:            WebGLUniformLocation | null
  Mv1:           WebGLUniformLocation | null
  Mv2:           WebGLUniformLocation | null
  Hv:            WebGLUniformLocation | null
  vLv:           WebGLUniformLocation | null
  vMv1:          WebGLUniformLocation | null
  vMv2:          WebGLUniformLocation | null
  energy:        WebGLUniformLocation | null
  sLv:           WebGLUniformLocation | null
  sMv1:          WebGLUniformLocation | null
  sMv2:          WebGLUniformLocation | null
  sHv:           WebGLUniformLocation | null
  rawLv:         WebGLUniformLocation | null
  rawMv1:        WebGLUniformLocation | null
  rawMv2:        WebGLUniformLocation | null
  rawHv:         WebGLUniformLocation | null
  tint:          WebGLUniformLocation | null
  time:          WebGLUniformLocation | null
  pitchColor:    WebGLUniformLocation | null
  moodEnergy:    WebGLUniformLocation | null
  moodTension:   WebGLUniformLocation | null
  moodWarmth:    WebGLUniformLocation | null
  moodBright:    WebGLUniformLocation | null
  moodComplex:   WebGLUniformLocation | null
}

// ── WebGL state ────────────────────────────────────────────────────────────────
let gl: WebGLRenderingContext | null = null
let mainProg: WebGLProgram | null = null
let blitProg: WebGLProgram | null = null
let fbos: Array<{ tex: WebGLTexture; fbo: WebGLFramebuffer }> = []
let quadBuf: WebGLBuffer | null = null
let logoTex: WebGLTexture | null = null
let defaultTex: WebGLTexture | null = null
let cur = 0
let W = 500, H = 500
let U: ULocs | null = null
let blitTexLoc: WebGLUniformLocation | null = null

let renderAF: number | null = null
let smoothAF: number | null = null
let startTime = 0
let destroyed = false

// ── Audio smoothing state ──────────────────────────────────────────────────────
let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
let _vLv = 0, _vMv1 = 0, _vMv2 = 0
let _energy = 0
let _sLv = 0, _sMv1 = 0, _sMv2 = 0, _sHv = 0
const ATK = 0.85, REL = 0.75, SLOW = 0.08

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const pBand   = (r: number) => Math.min(1, Math.pow(Math.max(0, (r - 0.01) * 0.80), 0.65))
const pVisual = (r: number) => Math.min(1, Math.pow(Math.max(0, (r - 0.01) * 1.00), 0.55))
// Boost dynamique ×8 au silence → ×1 à fort volume (utilise _energy du frame précédent)
const pHigh = (r: number) => {
  const base = isRaspberry ? 2.50 : 1.30
  const dyn  = base * (1 + 7 * Math.pow(Math.max(0, 1 - _energy * 2), 1.5))
  return Math.min(1, Math.pow(Math.max(0, (r - 0.01) * dyn), 0.55))
}

let _tc: TimeColorTint = [1, 1, 1]

const pitchAnalysis = inject<PitchAnalysisResult | null>('pitchAnalysis', null)
// Couleurs pitch et mood lissées pour éviter les sauts brutaux
let _pitchR = 0, _pitchG = 0, _pitchB = 0
let _moodEnergy = 0, _moodTension = 0, _moodWarmth = 0, _moodBright = 0, _moodComplex = 0
const PITCH_LERP = 1.00  // couleurs pitch — instantané (stabilité assurée par FFT_SMOOTHING=0.72 en amont)
const MOOD_LERP  = 0.02  // valeurs de mood — très lentes pour stabiliser les couleurs sur boucles

function smoothStep() {
  if (destroyed) return
  const rL  = pBand(props.bands.low),   rM1 = pBand(props.bands.mid1)
  const rM2 = pBand(props.bands.mid2),  rH  = pHigh(props.bands.high)
  _Lv  = lerp(_Lv,  rL,  rL  > _Lv  ? ATK : REL)
  _Mv1 = lerp(_Mv1, rM1, rM1 > _Mv1 ? ATK : REL)
  _Mv2 = lerp(_Mv2, rM2, rM2 > _Mv2 ? ATK : REL)
  _Hv  = lerp(_Hv,  rH,  rH  > _Hv  ? ATK : REL)

  const vL  = pVisual(props.bands.low)
  const vM1 = pVisual(props.bands.mid1)
  const vM2 = pVisual(props.bands.mid2)
  _vLv  = lerp(_vLv,  vL,  vL  > _vLv  ? ATK : REL)
  _vMv1 = lerp(_vMv1, vM1, vM1 > _vMv1 ? ATK : REL)
  _vMv2 = lerp(_vMv2, vM2, vM2 > _vMv2 ? ATK : REL)

  const peak = Math.max(_vLv, _vMv1, _vMv2, _Hv)
  _energy = lerp(_energy, peak, peak > _energy ? 0.85 : 0.70)

  _sLv  += (_Lv  - _sLv)  * SLOW
  _sMv1 += (_Mv1 - _sMv1) * SLOW
  _sMv2 += (_Mv2 - _sMv2) * SLOW
  _sHv  += (_Hv  - _sHv)  * SLOW

  if (colorTint?.value) _tc = colorTint.value

  if (pitchAnalysis) {
    // Couleur pitch : instantanée (PITCH_LERP = 1) — la stabilité vient du FFT_SMOOTHING en amont
    const [pr, pg, pb] = pitchAnalysis.blendedColor
    _pitchR += (pr - _pitchR) * PITCH_LERP
    _pitchG += (pg - _pitchG) * PITCH_LERP
    _pitchB += (pb - _pitchB) * PITCH_LERP
    // Mood : très lent pour éviter la modulation de couleur sur les boucles
    _moodEnergy  += (pitchAnalysis.mood.energy     - _moodEnergy)  * MOOD_LERP
    _moodTension += (pitchAnalysis.mood.tension    - _moodTension) * MOOD_LERP
    _moodWarmth  += (pitchAnalysis.mood.warmth     - _moodWarmth)  * MOOD_LERP
    _moodBright  += (pitchAnalysis.mood.brightness - _moodBright)  * MOOD_LERP
    _moodComplex += (pitchAnalysis.mood.complexity - _moodComplex) * MOOD_LERP
  }

  smoothAF = requestAnimationFrame(smoothStep)
}

// ── WebGL helpers ──────────────────────────────────────────────────────────────
const VS = `
attribute vec2 a_pos;
varying   vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const BLIT_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D u_tex;
void main() { gl_FragColor = texture2D(u_tex, vUv); }
`

function compileShader(type: number, src: string): WebGLShader {
  const g = gl!
  const s = g.createShader(type)!
  g.shaderSource(s, src)
  g.compileShader(s)
  if (!g.getShaderParameter(s, g.COMPILE_STATUS))
    throw new Error('Shader error:\n' + g.getShaderInfoLog(s))
  return s
}

function createProg(fsSrc: string): WebGLProgram {
  const g = gl!
  const p = g.createProgram()!
  g.attachShader(p, compileShader(g.VERTEX_SHADER, VS))
  g.attachShader(p, compileShader(g.FRAGMENT_SHADER, fsSrc))
  g.linkProgram(p)
  if (!g.getProgramParameter(p, g.LINK_STATUS))
    throw new Error('Link error:\n' + g.getProgramInfoLog(p))
  return p
}

function makeFBO(w: number, h: number): { tex: WebGLTexture; fbo: WebGLFramebuffer } {
  const g = gl!
  const tex = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, tex)
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
  const fbo = g.createFramebuffer()!
  g.bindFramebuffer(g.FRAMEBUFFER, fbo)
  g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0)
  g.bindFramebuffer(g.FRAMEBUFFER, null)
  return { tex, fbo }
}

function make1x1Tex(r: number, gv: number, b: number, a: number): WebGLTexture {
  const g = gl!
  const tex = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, tex)
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE,
    new Uint8Array([r, gv, b, a]))
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST)
  return tex
}

function bindQuad(p: WebGLProgram) {
  const g = gl!
  g.bindBuffer(g.ARRAY_BUFFER, quadBuf!)
  const loc = g.getAttribLocation(p, 'a_pos')
  g.enableVertexAttribArray(loc)
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0)
}

function resizeFBOs() {
  if (!gl) return
  fbos.forEach(({ tex, fbo }) => { gl!.deleteTexture(tex); gl!.deleteFramebuffer(fbo) })
  fbos = [makeFBO(W, H), makeFBO(W, H)]
  fbos.forEach(({ fbo }) => {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.clearColor(0, 0, 0, 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
  })
  gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
  cur = 0
}

// ── Render loop ────────────────────────────────────────────────────────────────
function frame() {
  if (destroyed || !gl || !mainProg || !blitProg || !U || fbos.length < 2) return
  const g = gl
  const u = U
  const write = fbos[cur]!
  const read  = fbos[1 - cur]!
  const t = (performance.now() - startTime) / 1000.0

  g.useProgram(mainProg)
  bindQuad(mainProg)

  g.activeTexture(g.TEXTURE0)
  g.bindTexture(g.TEXTURE_2D, read.tex)
  if (u.prev !== null) g.uniform1i(u.prev, 0)

  g.activeTexture(g.TEXTURE1)
  g.bindTexture(g.TEXTURE_2D, logoTex ?? defaultTex!)
  if (u.logo !== null) g.uniform1i(u.logo, 1)

  if (u.Lv     !== null) g.uniform1f(u.Lv,     _Lv)
  if (u.Mv1    !== null) g.uniform1f(u.Mv1,    _Mv1)
  if (u.Mv2    !== null) g.uniform1f(u.Mv2,    _Mv2)
  if (u.Hv     !== null) g.uniform1f(u.Hv,     _Hv)
  if (u.vLv    !== null) g.uniform1f(u.vLv,    _vLv)
  if (u.vMv1   !== null) g.uniform1f(u.vMv1,   _vMv1)
  if (u.vMv2   !== null) g.uniform1f(u.vMv2,   _vMv2)
  if (u.energy !== null) g.uniform1f(u.energy, _energy)
  if (u.sLv    !== null) g.uniform1f(u.sLv,    _sLv)
  if (u.sMv1   !== null) g.uniform1f(u.sMv1,   _sMv1)
  if (u.sMv2   !== null) g.uniform1f(u.sMv2,   _sMv2)
  if (u.sHv    !== null) g.uniform1f(u.sHv,    _sHv)
  if (u.rawLv  !== null) g.uniform1f(u.rawLv,  props.bands.low)
  if (u.rawMv1 !== null) g.uniform1f(u.rawMv1, props.bands.mid1)
  if (u.rawMv2 !== null) g.uniform1f(u.rawMv2, props.bands.mid2)
  if (u.rawHv  !== null) g.uniform1f(u.rawHv,  props.bands.high)
  if (u.tint        !== null) g.uniform3fv(u.tint,  _tc)
  if (u.time        !== null) g.uniform1f(u.time,   t)
  if (u.pitchColor  !== null) g.uniform3f(u.pitchColor,  _pitchR, _pitchG, _pitchB)
  if (u.moodEnergy  !== null) g.uniform1f(u.moodEnergy,  _moodEnergy)
  if (u.moodTension !== null) g.uniform1f(u.moodTension, _moodTension)
  if (u.moodWarmth  !== null) g.uniform1f(u.moodWarmth,  _moodWarmth)
  if (u.moodBright  !== null) g.uniform1f(u.moodBright,  _moodBright)
  if (u.moodComplex !== null) g.uniform1f(u.moodComplex, _moodComplex)

  g.bindFramebuffer(g.FRAMEBUFFER, write.fbo)
  g.viewport(0, 0, W, H)
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4)

  g.useProgram(blitProg)
  bindQuad(blitProg)
  g.activeTexture(g.TEXTURE0)
  g.bindTexture(g.TEXTURE_2D, write.tex)
  if (blitTexLoc !== null) g.uniform1i(blitTexLoc, 0)
  g.bindFramebuffer(g.FRAMEBUFFER, null)
  g.viewport(0, 0, W, H)
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4)

  cur = 1 - cur
  renderAF = requestAnimationFrame(frame)
}

// ── Logo texture ───────────────────────────────────────────────────────────────
async function loadLogoTexture(url: string) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
  if (!gl || !img.width) return
  const g = gl
  const tex = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, tex)
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, img)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
  if (logoTex) g.deleteTexture(logoTex)
  logoTex = tex
}

// ── Init / cleanup ─────────────────────────────────────────────────────────────
function syncSize() {
  const canvas = canvasEl.value!
  const dpr = Math.max(1.5, window.devicePixelRatio || 1)
  const w = Math.min(1000, Math.max(1, Math.floor((canvas.clientWidth  || window.innerWidth)  * dpr)))
  const h = Math.min(1000, Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr)))
  canvas.width = w; canvas.height = h
  return { w, h }
}

function stopLoops() {
  if (renderAF !== null) { cancelAnimationFrame(renderAF); renderAF = null }
  if (smoothAF !== null) { cancelAnimationFrame(smoothAF); smoothAF = null }
}

function cleanupGL() {
  if (!gl) return
  const g = gl
  fbos.forEach(({ tex, fbo }) => { g.deleteTexture(tex); g.deleteFramebuffer(fbo) })
  fbos = []
  if (mainProg)   { g.deleteProgram(mainProg);   mainProg   = null }
  if (blitProg)   { g.deleteProgram(blitProg);   blitProg   = null }
  if (quadBuf)    { g.deleteBuffer(quadBuf);      quadBuf    = null }
  if (logoTex)    { g.deleteTexture(logoTex);     logoTex    = null }
  if (defaultTex) { g.deleteTexture(defaultTex);  defaultTex = null }
  U = null
  gl = null
}

async function init() {
  stopLoops()
  cleanupGL()
  if (destroyed || !canvasEl.value) return

  await nextTick()

  const canvas = canvasEl.value!
  const { w, h } = syncSize()
  W = w; H = h

  const g = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
  if (!g) { console.error('WebGL non supporté'); return }
  gl = g

  try {
    mainProg = createProg(props.patch.fragSrc)
    blitProg = createProg(BLIT_FS)
  } catch (e) {
    console.error('GlslCanvas shader error:', e)
    return
  }

  quadBuf = g.createBuffer()!
  g.bindBuffer(g.ARRAY_BUFFER, quadBuf)
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), g.STATIC_DRAW)

  defaultTex = make1x1Tex(255, 255, 255, 255)

  fbos = [makeFBO(W, H), makeFBO(W, H)]
  fbos.forEach(({ fbo }) => {
    g.bindFramebuffer(g.FRAMEBUFFER, fbo)
    g.clearColor(0, 0, 0, 1)
    g.clear(g.COLOR_BUFFER_BIT)
  })
  g.bindFramebuffer(g.FRAMEBUFFER, null)
  cur = 0

  const loc = (name: string) => g.getUniformLocation(mainProg!, name)
  U = {
    prev:   loc('u_prev'),   logo:   loc('u_logo'),
    Lv:     loc('u_Lv'),     Mv1:    loc('u_Mv1'),
    Mv2:    loc('u_Mv2'),    Hv:     loc('u_Hv'),
    vLv:    loc('u_vLv'),    vMv1:   loc('u_vMv1'),
    vMv2:   loc('u_vMv2'),   energy: loc('u_energy'),
    sLv:    loc('u_sLv'),    sMv1:   loc('u_sMv1'),
    sMv2:   loc('u_sMv2'),   sHv:    loc('u_sHv'),
    rawLv:  loc('u_rawLv'),  rawMv1: loc('u_rawMv1'),
    rawMv2: loc('u_rawMv2'), rawHv:  loc('u_rawHv'),
    tint:       loc('u_tint'),      time:       loc('u_time'),
    pitchColor: loc('u_pitch_color'),
    moodEnergy: loc('u_mood_energy'),  moodTension: loc('u_mood_tension'),
    moodWarmth: loc('u_mood_warmth'),  moodBright:  loc('u_mood_brightness'),
    moodComplex: loc('u_mood_complexity'),
  }
  blitTexLoc = g.getUniformLocation(blitProg, 'u_tex')

  startTime = performance.now()
  _Lv = 0; _Mv1 = 0; _Mv2 = 0; _Hv = 0
  _vLv = 0; _vMv1 = 0; _vMv2 = 0; _energy = 0
  _sLv = 0; _sMv1 = 0; _sMv2 = 0; _sHv = 0
  _pitchR = 0; _pitchG = 0; _pitchB = 0
  _moodEnergy = 0; _moodTension = 0; _moodWarmth = 0; _moodBright = 0; _moodComplex = 0

  if (props.patch.logoUrl) {
    loadLogoTexture(props.patch.logoUrl)   // async, non-blocking
  }

  smoothAF = requestAnimationFrame(smoothStep)
  renderAF = requestAnimationFrame(frame)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  await init()

  const ro = new ResizeObserver(() => {
    if (!gl || !canvasEl.value) return
    const { w, h } = syncSize()
    if (w === W && h === H) return
    W = w; H = h
    resizeFBOs()
  })
  const parent = canvasEl.value?.parentElement
  if (parent) ro.observe(parent)

  canvasEl.value?.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    if (!destroyed) setTimeout(() => window.location.reload(), 2000)
  })

  onBeforeUnmount(() => {
    destroyed = true
    stopLoops()
    ro.disconnect()
    cleanupGL()
  })
})

watch(() => props.reloadToken, (next, prev) => {
  if (prev !== undefined && next !== prev) init()
})

watch(() => props.patch, () => init())
</script>
