declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav3aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null

  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  // Audio processing
  const NOISE_FLOOR = 0.005, GAIN = 27.0, GAMMA = 0.7
  const ATTACK = 0.6, RELEASE = 0.08, SILENCE_GATE = 0.02, SILENCE_FRAMES = 2
  const prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const silenceCount: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }

  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - NOISE_FLOOR) * GAIN
    v = Math.pow(Math.max(0, v), GAMMA)
    v = Math.min(1, Math.max(0, v))
    if (v < SILENCE_GATE) {
      silenceCount[key] = (silenceCount[key] || 0) + 1
      if (silenceCount[key] >= SILENCE_FRAMES) v = 0
    } else { silenceCount[key] = 0 }
    const p = prev[key] || 0
    const s = p + (v - p) * (v > p ? ATTACK : RELEASE)
    prev[key] = s
    return s
  }

  const g = (x: number) => Math.pow(Math.max(0, x), 0.8)
  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0

  const updateBands = () => {
    _Lv = g(processBand(bands.low, 'low'))
    _Mv1 = g(processBand(bands.mid1, 'mid1'))
    _Mv2 = g(processBand(bands.mid2, 'mid2'))
    _Hv = g(processBand(bands.high, 'high'))
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv

  // Noise field
  const softNoise = noise(() => 0.2 + (Mv1() + Mv2() + Hv()) * 5, () => 0.08 + Hv() * 2)
  const modL = () => 0.006 + Lv() * 0.02
  const modM1 = () => 0.006 + Mv1() * 0.6
  const modM2 = () => 0.006 + Mv2() * 0.09
  const modH = () => 0.006 + Hv() * 0.34

  // Layers
  const lowTeal = osc(1, 0, 0).modulate(softNoise, modL)
    .color(() => 0.02 + Lv() * 0.06, () => 0.10 + Lv() * 0.50, () => 0.14 + Lv() * 0.55)
  const midCarmin = osc(5, 0, 0).modulate(softNoise, modM1)
    .color(() => 0.22 + Mv1() * 0.72, 0, () => 0.10 + Mv1() * 0.32)
  const midAmber = osc(10, 0, 0).modulate(softNoise, modM2)
    .color(() => 0.18 + Mv2() * 0.68, () => 0.12 + Mv2() * 0.60, 0)
  const highIce = osc(20, 0, 0).modulate(softNoise, modH)
    .color(
      () => 0.10 + Math.min(0.46, Hv() * 0.50),
      () => 0.16 + Math.min(0.58, Hv() * 0.62),
      () => 0.20 + Math.min(0.72, Hv() * 0.78),
    )

  lowTeal
    .add(midCarmin, 0.92)
    .add(midAmber, 0.92)
    .add(highIce, 0.90)
    .saturate(0.98)
    .brightness(() => 0 - Lv() * 0.15 - Mv1() * 0.15 - Mv1() * 0.15 - Hv() * 0.5)
    .contrast(2)
    .luma(0.1, 0.1)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
