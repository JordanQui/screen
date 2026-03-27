declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const NOISE_FLOOR = 0.005, GAIN = 22.0, GAMMA = 0.65
  const ATTACK = 0.55, RELEASE = 0.07, SILENCE_GATE = 0.015, SILENCE_FRAMES = 2
  const _prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const _sil: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }

  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - NOISE_FLOOR) * GAIN
    v = Math.pow(Math.max(0, v), GAMMA)
    v = Math.min(1, Math.max(0, v))
    if (v < SILENCE_GATE) { _sil[key] = (_sil[key] || 0) + 1; if (_sil[key] >= SILENCE_FRAMES) v = 0 }
    else { _sil[key] = 0 }
    const p = _prev[key] || 0
    const s = p + (v - p) * (v > p ? ATTACK : RELEASE)
    _prev[key] = s
    return s
  }

  const gv = (x: number) => Math.pow(Math.max(0, x), 0.75)
  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0, _E = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low, 'low'))
    _Mv1 = gv(processBand(bands.mid1, 'mid1'))
    _Mv2 = gv(processBand(bands.mid2, 'mid2'))
    _Hv = gv(processBand(bands.high, 'high'))
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hv)
    _E += (raw - _E) * (raw > _E ? 0.40 : 0.05)
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv, E = () => _E

  const flow = noise(() => 0.35 + (Mv1() + Mv2()) * 2.4 + Hv() * 3.0, () => 0.08 + Hv() * 0.24)
  const modAmt = () => 0.010 + Lv() * 0.020 + (Mv1() + Mv2()) * 0.018 + Hv() * 0.030

  const baseBg = noise(() => 0.20 + E() * 0.40, () => 0.05 + E() * 0.12)
    .color(0.04, 0.03, 0.07).brightness(0.02).contrast(0.95)

  const rouge = osc(() => 4 + Lv() * 16, () => 0.35 + Lv() * 0.40, 0).modulate(flow, modAmt)
    .color(() => 0.28 + Lv() * 0.72, () => Lv() * 0.06, 0)
  const orange = osc(() => 5 + Lv() * 8 + Mv1() * 7, () => 0.38 + (Lv() + Mv1()) * 0.28, 0.4).modulate(flow, modAmt)
    .color(() => 0.26 + (Lv() * 0.45 + Mv1() * 0.38), () => 0.08 + (Lv() * 0.18 + Mv1() * 0.16), 0)
  const jaune = osc(() => 6 + Mv1() * 18, () => 0.42 + Mv1() * 0.36, 0.8).modulate(flow, modAmt)
    .color(() => 0.26 + Mv1() * 0.74, () => 0.24 + Mv1() * 0.72, 0)
  const vert = osc(() => 7 + Mv1() * 8 + Mv2() * 9, () => 0.40 + (Mv1() + Mv2()) * 0.22, 1.2).modulate(flow, modAmt)
    .color(0, () => 0.28 + (Mv1() * 0.38 + Mv2() * 0.40), () => Mv2() * 0.08)
  const cyan = osc(() => 9 + Mv2() * 18, () => 0.44 + Mv2() * 0.38, 1.6).modulate(flow, modAmt)
    .color(0, () => 0.26 + Mv2() * 0.72, () => 0.26 + Mv2() * 0.74)
  const bleu = osc(() => 11 + Mv2() * 9 + Hv() * 9, () => 0.46 + (Mv2() + Hv()) * 0.22, 2.0).modulate(flow, modAmt)
    .color(() => Hv() * 0.06, () => 0.04 + (Mv2() * 0.10 + Hv() * 0.08), () => 0.28 + (Mv2() * 0.38 + Hv() * 0.42))
  const violet = osc(() => 14 + Hv() * 20, () => 0.50 + Hv() * 0.42, 2.4).modulate(flow, modAmt)
    .color(() => 0.18 + Hv() * 0.64, 0, () => 0.28 + Hv() * 0.72)

  baseBg
    .add(rouge, 0.98).add(orange, 0.98).add(jaune, 0.98).add(vert, 0.98)
    .add(cyan, 0.98).add(bleu, 0.98).add(violet, 0.98)
    .saturate(() => 1.25 + E() * 1.10)
    .contrast(() => 1.10 + E() * 0.90)
    .brightness(() => 0.015 + E() * 0.08)
    .hue(() => 0.01 + E() * 0.08)
    .scrollX(() => (Mv2() - Lv()) * 0.0020)
    .scrollY(() => (Mv1() - Hv()) * 0.0020)
    .blend(
      src(o0).scale(() => 1.002 + E() * 0.004).rotate(() => (Hv() - Lv()) * 0.006).colorama(() => 0.002 + E() * 0.014).contrast(1.0006),
      () => Math.min(0.18, 0.03 + E() * 0.12),
    )
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
