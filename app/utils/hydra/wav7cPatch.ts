declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav7cPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const _prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - 0.005) * 22.0
    v = Math.pow(Math.max(0, v), 0.65)
    v = Math.min(1, Math.max(0, v))
    const p = _prev[key] || 0
    const s = p + (v - p) * (v > p ? 0.55 : 0.45)
    _prev[key] = s
    return s
  }
  const gv = (x: number) => Math.pow(Math.max(0, x), 0.75)

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0, _Hsens = 0
  const H_GAIN = 1.8, H_GAMMA = 0.60
  const NOISE_FLOOR = 0.02, SILENCE_GATE = 0.06, ATTACK_COEF = 0.30, RELEASE_COEF = 0.35
  let energy = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low, 'low'))
    _Mv1 = gv(processBand(bands.mid1, 'mid1'))
    _Mv2 = gv(processBand(bands.mid2, 'mid2'))
    _Hv = gv(processBand(bands.high, 'high'))
    _Hsens = Math.min(1, Math.pow(Math.max(0, _Hv), H_GAMMA) * H_GAIN)
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hsens)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = Math.min(1, above)
    const coef = target > energy ? ATTACK_COEF : RELEASE_COEF
    energy += (target - energy) * coef
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2
  const Hsens = () => _Hsens, E = () => energy
  const FB_G = () => { const x = Math.max(0, energy - SILENCE_GATE) / (1 - SILENCE_GATE); return Math.pow(x, 1.2) }

  const fLow = () => 6 + Lv() * 8 + Hsens() * 2.5 + (Lv() * 1.2) * (Math.sin(time * 0.9) + Math.sin(time * 1.31)) * 0.5
  const fM1 = () => 9 + Mv1() * 6 + Hsens() * 4.0 + (Mv1() * 1.0) * (Math.sin(time * 1.1) + Math.sin(time * 1.77)) * 0.5
  const fM2 = () => 12 + Mv2() * 8 + Hsens() * 7.5 + (Mv2() * 1.2) * (Math.sin(time * 1.3) + Math.sin(time * 2.03)) * 0.5

  const base = osc(() => fLow() + Hsens() * 2, 0, () => (Lv() + Mv1() + Mv2()) * 0.2 + Hsens() * 24)
    .add(osc(fM1, 0, 1), 0.6)
    .add(osc(fM2, 0, 1), 0.6)
    .contrast(() => 1.03 + Hsens() * 2)
    .brightness(-0.5)

  const coarseNoise = noise(() => 0.5 + (Lv() + Mv1()) * 1.8, () => 0.08 + Mv2() * 0.25)
  const fineNoise = noise(() => 0.24 + Hsens() * 4, () => 0.6 + Hsens() * 0.60)

  const field = coarseNoise.add(fineNoise, () => 0.55 + Hsens() * 0.45)
    .contrast(() => 1.0 + E() * 0.10 + Hsens() * 0.06)

  base
    .modulate(field, () => (0.005 + (Lv() + Mv1() + Mv2()) * 0.01 + Hsens() * 0.035) * FB_G())
    .add(fineNoise, () => (0.02 + Hsens() * 0.22) * FB_G())
    .contrast(() => 1.01 + E() * 0.06 + Hsens() * 0.04)
    .brightness(() => -0.06 - E() * 0.04 - Hsens() * 0.015)
    .add(
      src(o0)
        .modulate(field, () => (0.006 + E() * 0.015 + Hsens() * 0.012) * FB_G())
        .colorama(() => 0.24 * FB_G() * 5)
        .contrast(() => 1.003 + Hsens() * 0.003),
      () => Math.min(0.38, (0.06 + (Lv() + Mv1()) * 0.14 + Hsens() * 0.18) * FB_G()),
    )
    .brightness(-0.25)
    .luma(() => 0.75 + (E() - 0.5) * 0.10 + Hsens() * -0.4)
    .blend(o0)
    .scale(8)
    .color(() => Math.min(1, E() * 4), () => Math.min(1, E() * 4), () => Math.min(1, E() * 4))
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
