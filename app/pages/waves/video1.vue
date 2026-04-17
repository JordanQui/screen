<template>
  <div class="patch-page">
    <canvas ref="canvasEl" class="canvas" />
    <video ref="videoRef" src="/assets/video1.MOV" loop muted playsinline preload="auto" style="display:none" />
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { HydraBandValues, TimeColorTint } from '~/utils/hydra/types'

const canvasEl = ref<HTMLCanvasElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const bands     = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
const colorTint = inject<Ref<TimeColorTint> | null>('timeColorTint', null)

// ── Shaders ─────────────────────────────────────────────────────────────────

const VS = `
attribute vec2 a_pos;
varying   vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Vidéo N&B + aberration chromatique uniquement sur les contours Sobel
const FS = `
precision mediump float;
varying   vec2 vUv;
uniform sampler2D u_video;
uniform sampler2D u_prev;
uniform float u_time;
uniform float u_Lv;
uniform float u_Mv1;
uniform float u_Mv2;
uniform float u_Hv;
uniform vec3  u_tint;
uniform vec2  u_resolution;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float sobel(vec2 uv, vec2 px) {
  float tl = luma(texture2D(u_video, uv + vec2(-px.x, -px.y)).rgb);
  float tc = luma(texture2D(u_video, uv + vec2(  0.0, -px.y)).rgb);
  float tr = luma(texture2D(u_video, uv + vec2( px.x, -px.y)).rgb);
  float ml = luma(texture2D(u_video, uv + vec2(-px.x,  0.0 )).rgb);
  float mr = luma(texture2D(u_video, uv + vec2( px.x,  0.0 )).rgb);
  float bl = luma(texture2D(u_video, uv + vec2(-px.x,  px.y)).rgb);
  float bc = luma(texture2D(u_video, uv + vec2(  0.0,  px.y)).rgb);
  float br = luma(texture2D(u_video, uv + vec2( px.x,  px.y)).rgb);
  float gx = (-tl - 2.0*ml - bl) + (tr + 2.0*mr + br);
  float gy = (-tl - 2.0*tc - tr) + (bl + 2.0*bc + br);
  return length(vec2(gx, gy));
}

void main() {
  float L = u_Lv, M1 = u_Mv1, M2 = u_Mv2, H = u_Hv;

  vec2  px  = vec2(0.0018);
  float amp = 4.5 + L * 8.0 + M1 * 2.5;

  // Aberration : les aigus écartent les canaux sans augmenter la luminosité
  float aberr = 0.005 + L * 0.045 + H * 0.090 + M1 * 0.022;

  // Exposant 0.55 : courbe plus douce, les bords ne clippent pas tous à 1.0
  float edgeR = clamp(pow(sobel(vUv - vec2(aberr, 0.0), px) * amp, 0.55), 0.0, 1.0);
  float edgeG = clamp(pow(sobel(vUv,                    px) * amp, 0.55), 0.0, 1.0);
  float edgeB = clamp(pow(sobel(vUv + vec2(aberr, 0.0), px) * amp, 0.55), 0.0, 1.0);

  // Gate : seulement L + M1 + M2 — les aigus n'augmentent plus la luminosité
  float gate = clamp((L + M1 + M2) * 1.8, 0.0, 1.0);

  vec3 edges = vec3(edgeR, edgeG, edgeB) * gate;

  // Scan lines légères
  float scan = sin(vUv.y * u_resolution.y * 3.14159) * 0.08 + 0.92;
  edges *= scan;

  // Grain hautes fréquences
  float grain = hash21(vUv + vec2(floor(u_time * 20.0) * 0.13, 0.0)) * H * 0.03;
  edges += grain * gate;

  vec3 col = edges;

  // Feedback — aberration persistée dans le prev
  float fbDriftX = sin(u_time * 0.09 + vUv.y * 3.5) * 0.00018 + (M1 - M2) * 0.00022;
  float fbDriftY = (L - H * 0.4) * 0.00018 + sin(u_time * 0.13) * 0.00010;
  vec2  fbBase   = (vUv - 0.5) * (1.0 - L * 0.005) + 0.5 + vec2(fbDriftX, fbDriftY);

  float prevR = texture2D(u_prev, clamp(fbBase - vec2(aberr * 0.40, 0.0), 0.0, 1.0)).r;
  float prevG = texture2D(u_prev, clamp(fbBase,                           0.0, 1.0)).g;
  float prevB = texture2D(u_prev, clamp(fbBase + vec2(aberr * 0.40, 0.0), 0.0, 1.0)).b;
  vec3  prev  = vec3(prevR, prevG, prevB);

  prev.r *= 0.970 - H * 0.010;
  prev.g *= 0.973 - H * 0.008;
  prev.b *= 0.967 - H * 0.012;

  float fbAmt = 0.65;

  col = clamp(col + prev * fbAmt, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`

const BLIT_FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D u_tex;
void main() { gl_FragColor = texture2D(u_tex, vUv); }`

// ── WebGL state ──────────────────────────────────────────────────────────────

type FBO = { tex: WebGLTexture; fbo: WebGLFramebuffer }
type ULocs = {
  video: WebGLUniformLocation | null
  prev:  WebGLUniformLocation | null
  Lv:    WebGLUniformLocation | null
  Mv1:   WebGLUniformLocation | null
  Mv2:   WebGLUniformLocation | null
  Hv:    WebGLUniformLocation | null
  tint:  WebGLUniformLocation | null
  time:  WebGLUniformLocation | null
  res:   WebGLUniformLocation | null
}

let gl: WebGLRenderingContext | null = null
let mainProg: WebGLProgram | null = null
let blitProg: WebGLProgram | null = null
let fbos: FBO[] = []
let quadBuf: WebGLBuffer | null = null
let videoTex: WebGLTexture | null = null
let blackTex: WebGLTexture | null = null
let U: ULocs | null = null
let blitTexLoc: WebGLUniformLocation | null = null
let cur = 0
let W = 500, H = 500
let renderAF: number | null = null
let smoothAF: number | null = null
let startTime = 0
let destroyed = false
let videoTime = 0
let lastFrameNow = 0

// ── Audio smoothing ──────────────────────────────────────────────────────────

let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
let _tc: TimeColorTint = [1, 1, 1]
const ATK = 0.85, REL = 0.75
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t
const pBand   = (r: number) => Math.min(1, Math.pow(Math.max(0, (r - 0.01) * 0.80), 0.65))
const pHigh   = (r: number) => Math.min(1, Math.pow(Math.max(0, (r - 0.01) * 3.50), 0.50))

function smoothLoop() {
  if (destroyed) return
  const rL = pBand(bands.low), rM1 = pBand(bands.mid1)
  const rM2 = pBand(bands.mid2), rH = pHigh(bands.high)
  _Lv  = lerp(_Lv,  rL,  rL  > _Lv  ? ATK : REL)
  _Mv1 = lerp(_Mv1, rM1, rM1 > _Mv1 ? ATK : REL)
  _Mv2 = lerp(_Mv2, rM2, rM2 > _Mv2 ? ATK : REL)
  _Hv  = lerp(_Hv,  rH,  rH  > _Hv  ? ATK : REL)
  if (colorTint?.value) _tc = colorTint.value
  smoothAF = requestAnimationFrame(smoothLoop)
}

// ── WebGL helpers ────────────────────────────────────────────────────────────

function compileShader(type: number, src: string): WebGLShader {
  const g = gl!
  const s = g.createShader(type)!
  g.shaderSource(s, src)
  g.compileShader(s)
  if (!g.getShaderParameter(s, g.COMPILE_STATUS))
    throw new Error(g.getShaderInfoLog(s) ?? 'compile error')
  return s
}

function createProg(fsSrc: string): WebGLProgram {
  const g = gl!
  const p = g.createProgram()!
  g.attachShader(p, compileShader(g.VERTEX_SHADER, VS))
  g.attachShader(p, compileShader(g.FRAGMENT_SHADER, fsSrc))
  g.linkProgram(p)
  if (!g.getProgramParameter(p, g.LINK_STATUS))
    throw new Error(g.getProgramInfoLog(p) ?? 'link error')
  return p
}

function makeFBO(w: number, h: number): FBO {
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

function bindQuad(prog: WebGLProgram) {
  const g = gl!
  g.bindBuffer(g.ARRAY_BUFFER, quadBuf!)
  const loc = g.getAttribLocation(prog, 'a_pos')
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

// Upload la frame vidéo courante dans videoTex
function uploadVideoFrame() {
  const v = videoRef.value
  if (!gl || !videoTex || !v || v.readyState < 2) return
  const g = gl
  g.bindTexture(g.TEXTURE_2D, videoTex)
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true)
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, v)
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false)
}

// Contrôle la vitesse de lecture via playbackRate selon l'énergie audio
// Au silence la vidéo est en pause, au son elle accélère
function scrubVideo() {
  const v = videoRef.value
  if (!v) return
  const speed = _Lv * 4.0 + _Mv1 * 2.0 + _Mv2 * 1.0 + _Hv * 0.5
  if (speed < 0.02) {
    if (!v.paused) v.pause()
  } else {
    if (v.paused) v.play().catch(() => {})
    try { v.playbackRate = Math.min(8.0, speed) } catch {}
  }
}

// ── Render loop ──────────────────────────────────────────────────────────────

function frame() {
  if (destroyed || !gl || !mainProg || !blitProg || !U || fbos.length < 2) return
  const g   = gl
  const write = fbos[cur]!
  const read  = fbos[1 - cur]!
  const now = performance.now()
  const t = (now - startTime) / 1000.0

  scrubVideo()
  uploadVideoFrame()

  g.useProgram(mainProg)
  bindQuad(mainProg)

  g.activeTexture(g.TEXTURE0)
  g.bindTexture(g.TEXTURE_2D, videoTex ?? blackTex!)
  if (U.video !== null) g.uniform1i(U.video, 0)

  g.activeTexture(g.TEXTURE1)
  g.bindTexture(g.TEXTURE_2D, read.tex)
  if (U.prev  !== null) g.uniform1i(U.prev,  1)

  if (U.Lv   !== null) g.uniform1f(U.Lv,   _Lv)
  if (U.Mv1  !== null) g.uniform1f(U.Mv1,  _Mv1)
  if (U.Mv2  !== null) g.uniform1f(U.Mv2,  _Mv2)
  if (U.Hv   !== null) g.uniform1f(U.Hv,   _Hv)
  if (U.tint !== null) g.uniform3fv(U.tint, _tc)
  if (U.time !== null) g.uniform1f(U.time,  t)
  if (U.res  !== null) g.uniform2f(U.res,   W, H)

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

// ── Init / cleanup ───────────────────────────────────────────────────────────

function syncSize() {
  const canvas = canvasEl.value!
  const dpr = Math.max(1.5, window.devicePixelRatio || 1)
  const w = Math.min(1000, Math.max(1, Math.floor((canvas.clientWidth  || window.innerWidth)  * dpr)))
  const h = Math.min(1000, Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr)))
  canvas.width = w
  canvas.height = h
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
  if (mainProg)  { g.deleteProgram(mainProg);  mainProg  = null }
  if (blitProg)  { g.deleteProgram(blitProg);  blitProg  = null }
  if (quadBuf)   { g.deleteBuffer(quadBuf);     quadBuf   = null }
  if (videoTex)  { g.deleteTexture(videoTex);   videoTex  = null }
  if (blackTex)  { g.deleteTexture(blackTex);   blackTex  = null }
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
  if (!g) return
  gl = g

  try {
    mainProg = createProg(FS)
    blitProg = createProg(BLIT_FS)
  } catch (e) {
    console.error('[video1] shader error:', e)
    return
  }

  quadBuf = g.createBuffer()!
  g.bindBuffer(g.ARRAY_BUFFER, quadBuf)
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW)

  videoTex = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, videoTex)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)

  // Texture noire par défaut tant que la vidéo n'est pas prête
  blackTex = g.createTexture()!
  g.bindTexture(g.TEXTURE_2D, blackTex)
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, 1, 1, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST)

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
    video: loc('u_video'),
    prev:  loc('u_prev'),
    Lv:    loc('u_Lv'),
    Mv1:   loc('u_Mv1'),
    Mv2:   loc('u_Mv2'),
    Hv:    loc('u_Hv'),
    tint:  loc('u_tint'),
    time:  loc('u_time'),
    res:   loc('u_resolution'),
  }
  blitTexLoc = g.getUniformLocation(blitProg, 'u_tex')

  startTime = performance.now()
  _Lv = 0; _Mv1 = 0; _Mv2 = 0; _Hv = 0
  videoTime = 0; lastFrameNow = 0
  videoRef.value?.play().catch(() => {})

  smoothAF = requestAnimationFrame(smoothLoop)
  renderAF = requestAnimationFrame(frame)
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

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
    const v = videoRef.value
    if (v) { v.pause(); v.src = '' }
  })
})
</script>

<style scoped>
.patch-page { position: fixed; inset: 0; background: #000; }
.canvas { display: block; width: 100%; height: 100%; }
</style>
