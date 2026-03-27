<template>
  <canvas ref="canvasEl" class="hydra-canvas"></canvas>
</template>

<script setup lang="ts">
import type { HydraApi, HydraBandValues, HydraPatchController, PatchFactory } from '~/utils/hydra/types'

const props = defineProps<{
  patchFactory: PatchFactory
  bands: HydraBandValues
}>()

const emit = defineEmits<{ ready: [] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

let hydraInstance: any = null
let patchCtrl: HydraPatchController | null = null
let bandLoop: number | null = null
let resizeObserver: ResizeObserver | null = null

function resolveApi(hydra: any): HydraApi | null {
  const synth = hydra.synth ?? {}
  const osc = hydra.osc ?? synth.osc
  const noise = hydra.noise ?? synth.noise
  const src = hydra.src ?? synth.src
  const solid = hydra.solid ?? synth.solid
  const shape = hydra.shape ?? synth.shape
  const render = hydra.render ?? synth.render
  const o0 = (hydra as any).o0 ?? (synth as any).o0
  if (typeof osc !== 'function' || typeof noise !== 'function' || typeof src !== 'function' || !o0) return null
  return { osc, noise, src, solid, shape, render, o0 }
}

async function init() {
  const canvas = canvasEl.value
  if (!canvas) return

  const Hydra = (await import('hydra-synth')).default

  const dpr = Math.min(3.0, window.devicePixelRatio || 1)
  const w = Math.floor(canvas.clientWidth * dpr)
  const h = Math.floor(canvas.clientHeight * dpr)
  canvas.width = w
  canvas.height = h

  hydraInstance = new Hydra({
    canvas,
    detectAudio: false,
    makeGlobal: false,
    autoLoop: true,
    width: w,
    height: h,
    pixelRatio: 1,
  })

  // Sync time to window for patch closures that reference `time`
  Object.defineProperty(window, 'time', {
    get: () => hydraInstance?.synth?.time ?? 0,
    configurable: true,
  })

  const api = resolveApi(hydraInstance)
  if (!api) return

  patchCtrl = props.patchFactory(api)

  // Push bands to patch every frame
  const pushBands = () => {
    patchCtrl?.setBands({
      low: props.bands.low,
      mid1: props.bands.mid1,
      mid2: props.bands.mid2,
      high: props.bands.high,
    })
    bandLoop = requestAnimationFrame(pushBands)
  }
  bandLoop = requestAnimationFrame(pushBands)

  // Resize handling
  const resize = () => {
    if (!canvas || !hydraInstance) return
    const d = Math.min(3.0, window.devicePixelRatio || 1)
    const nw = Math.max(1, Math.floor(canvas.clientWidth * d))
    const nh = Math.max(1, Math.floor(canvas.clientHeight * d))
    canvas.width = nw
    canvas.height = nh
    hydraInstance.setResolution?.(nw, nh)
  }
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)

  emit('ready')
}

function cleanup() {
  if (bandLoop !== null) cancelAnimationFrame(bandLoop)
  bandLoop = null
  patchCtrl?.stop()
  patchCtrl = null
  resizeObserver?.disconnect()
  resizeObserver = null
  hydraInstance = null
}

onMounted(() => init())
onBeforeUnmount(() => cleanup())
</script>

<style scoped>
.hydra-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}
</style>
