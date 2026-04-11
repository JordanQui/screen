<template>
  <div ref="containerEl" class="hydra-canvas-stack">
    <canvas
      ref="canvasAEl"
      class="hydra-canvas"
      :class="{ 'is-active': activeSlot === 0 }"
    ></canvas>
    <canvas
      ref="canvasBEl"
      class="hydra-canvas"
      :class="{ 'is-active': activeSlot === 1 }"
    ></canvas>
  </div>
</template>

<script setup lang="ts">
import type { HydraApi, HydraBandValues, HydraPatchController, PatchFactory } from '~/utils/hydra/types'

const props = defineProps<{
  patchFactory: PatchFactory
  bands: HydraBandValues
  reloadToken?: number
}>()

const emit = defineEmits<{ ready: [] }>()

const containerEl = ref<HTMLDivElement | null>(null)
const canvasAEl = ref<HTMLCanvasElement | null>(null)
const canvasBEl = ref<HTMLCanvasElement | null>(null)
const activeSlot = ref(0)

type HydraRuntime = {
  hydraInstance: any
  patchCtrl: HydraPatchController | null
  bandLoop: number | null
  hydraLoop: number | null
  lastHydraTick: number
  lastSuccessfulRender: number
}

const runtimes: Array<HydraRuntime | null> = [null, null]
let resizeObserver: ResizeObserver | null = null
let restartPromise: Promise<void> | null = null
let destroyed = false
let watchdogInterval: ReturnType<typeof setInterval> | null = null

function getCanvas(slot: number) {
  return slot === 0 ? canvasAEl.value : canvasBEl.value
}

function resolveApi(hydra: any): HydraApi | null {
  const synth = hydra.synth ?? {}
  const osc = hydra.osc ?? synth.osc
  const noise = hydra.noise ?? synth.noise
  const src = hydra.src ?? synth.src
  const solid = hydra.solid ?? synth.solid
  const shape = hydra.shape ?? synth.shape
  const render = hydra.render ?? synth.render
  const o0 = (hydra as any).o0 ?? (synth as any).o0
  const o1 = (hydra as any).o1 ?? (synth as any).o1
  if (typeof osc !== 'function' || typeof noise !== 'function' || typeof src !== 'function' || !o0) return null
  return { osc, noise, src, solid, shape, render, o0, o1 }
}

function syncCanvasSize(canvas: HTMLCanvasElement) {
  const dpr = Math.max(1.5, window.devicePixelRatio || 1)
  const cssW = canvas.clientWidth || window.innerWidth
  const cssH = canvas.clientHeight || window.innerHeight
  const w = Math.min(1000, Math.max(1, Math.floor(cssW * dpr)))
  const h = Math.min(1000, Math.max(1, Math.floor(cssH * dpr)))
  canvas.width = w
  canvas.height = h
  return { w, h }
}

function cleanupSlot(slot: number) {
  const runtime = runtimes[slot]
  if (!runtime) return

  if (runtime.bandLoop !== null) cancelAnimationFrame(runtime.bandLoop)
  if (runtime.hydraLoop !== null) cancelAnimationFrame(runtime.hydraLoop)
  runtime.patchCtrl?.stop()
  try { runtime.hydraInstance?.synth?.hush?.() } catch {}
  try { runtime.hydraInstance?.regl?.destroy?.() } catch {}
  runtimes[slot] = null
}

async function initSlot(slot: number) {
  const canvas = getCanvas(slot)
  if (!canvas) return false

  const Hydra = (await import('hydra-synth')).default

  const { w, h } = syncCanvasSize(canvas)

  const hydraInstance = new Hydra({
    canvas,
    detectAudio: false,
    makeGlobal: false,
    autoLoop: false,
    width: w,
    height: h,
    pixelRatio: 1,
    precision: 'highp',
  })

  // Sync time to window for patch closures that reference `time`
  Object.defineProperty(window, 'time', {
    get: () => hydraInstance?.synth?.time ?? 0,
    configurable: true,
  })

  const api = resolveApi(hydraInstance)
  if (!api) {
    try { hydraInstance?.regl?.destroy?.() } catch {}
    return false
  }

  const runtime: HydraRuntime = {
    hydraInstance,
    patchCtrl: props.patchFactory(api),
    bandLoop: null,
    hydraLoop: null,
    lastHydraTick: 0,
    lastSuccessfulRender: performance.now(),
  }

  const startHydraLoop = () => {
    runtime.lastHydraTick = performance.now()
    const step = (now: number) => {
      if (!runtimes[slot]) return
      const dt = now - runtime.lastHydraTick
      runtime.lastHydraTick = now
      try {
        hydraInstance.tick?.(dt)
        runtime.lastSuccessfulRender = now
      } catch {}
      runtime.hydraLoop = requestAnimationFrame(step)
    }
    runtime.hydraLoop = requestAnimationFrame(step)
  }

  // Push bands to patch every frame
  const pushBands = () => {
    runtime.patchCtrl?.setBands({
      low: props.bands.low,
      mid1: props.bands.mid1,
      mid2: props.bands.mid2,
      high: props.bands.high,
    })
    runtime.bandLoop = requestAnimationFrame(pushBands)
  }
  runtime.bandLoop = requestAnimationFrame(pushBands)

  startHydraLoop()
  runtimes[slot] = runtime

  emit('ready')
  return true
}

async function restart() {
  if (destroyed) return
  if (restartPromise) {
    await restartPromise
    return
  }

  restartPromise = (async () => {
    const nextSlot = activeSlot.value === 0 ? 1 : 0
    cleanupSlot(nextSlot)
    const ready = await initSlot(nextSlot)
    if (!ready || destroyed) return
    activeSlot.value = nextSlot
    cleanupSlot(nextSlot === 0 ? 1 : 0)
  })()

  try {
    await restartPromise
  } finally {
    restartPromise = null
  }
}

function cleanup() {
  destroyed = true
  cleanupSlot(0)
  cleanupSlot(1)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (watchdogInterval !== null) { clearInterval(watchdogInterval); watchdogInterval = null }
}

onMounted(async () => {
  await nextTick()
  await initSlot(activeSlot.value)

  const resize = () => {
    for (const slot of [0, 1]) {
      const canvas = getCanvas(slot)
      const runtime = runtimes[slot]
      if (!canvas || !runtime) continue
      const { w, h } = syncCanvasSize(canvas)
      runtime.hydraInstance.setResolution?.(w, h)
    }
  }

  resizeObserver = new ResizeObserver(resize)
  if (containerEl.value) resizeObserver.observe(containerEl.value)

  // GPU crash → reload page (kiosk: état propre garanti)
  for (const canvasRef of [canvasAEl, canvasBEl]) {
    canvasRef.value?.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      if (!destroyed) setTimeout(() => window.location.reload(), 2000)
    })
  }

  // Watchdog: dernier recours si webglcontextlost ne fire pas (ARM/egl)
  // Lit un pixel — si le canvas est blanc (GPU mort) pendant 3 checks consécutifs → reload
  let whiteCount = 0
  watchdogInterval = setInterval(() => {
    if (destroyed) return
    const canvas = getCanvas(activeSlot.value)
    if (!canvas) return
    try {
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      if (gl?.isContextLost()) {
        window.location.reload()
        return
      }
    } catch {}
    // Watchdog render : si tick() échoue silencieusement depuis >8s → reload
    const runtime = runtimes[activeSlot.value]
    if (!runtime) return
    if (performance.now() - runtime.lastSuccessfulRender > 8000) {
      whiteCount++
      if (whiteCount >= 2) window.location.reload()
    } else {
      whiteCount = 0
    }
  }, 4000)
})

watch(() => props.reloadToken, async (next, prev) => {
  if (prev === undefined || next === prev) return
  await restart()
})

onBeforeUnmount(() => cleanup())
</script>

<style scoped>
.hydra-canvas-stack {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.hydra-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
  opacity: 0;
  transition: opacity 120ms linear;
}

.hydra-canvas.is-active {
  opacity: 1;
}
</style>
