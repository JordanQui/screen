declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const NOISE_FLOOR = 0.005, GAIN = 0.7, GAMMA = 1.0
  const ATTACK = 0.55, RELEASE = 0.45, SILENCE_GATE = 0.015, SILENCE_FRAMES = 2
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
    _E += (raw - _E) * (raw > _E ? 0.40 : 0.35)
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv, E = () => _E

  const flowLo = noise(() => 0.2 + Lv() * 1.5, () => Lv() * 0.15)
  const flowMid = noise(() => 0.4 + (Mv1() + Mv2()) * 2.5, () => (Mv1() + Mv2()) * 0.20)
  const flowHi = noise(() => 0.8 + Hv() * 4.0, () => Hv() * 0.30)

  const baseBg = noise(() => 0.20 + E() * 0.40, () => E() * 0.17)
    .color(0.04, 0.03, 0.07).brightness(0.02).contrast(0.95)

  // LOW — tons chair chauds
  const rouge = osc(() => 3 + Lv() * 10, () => Lv() * 0.50, 0)
    .modulate(flowLo, () => Lv() * 0.04)
    .color(() => 0.22 + Lv() * 0.70, () => 0.10 + Lv() * 0.30, () => 0.06 + Lv() * 0.18)
  const orange = osc(() => 4 + Lv() * 6, () => Lv() * 0.35, 0.4)
    .modulate(flowLo, () => Lv() * 0.03)
    .color(() => 0.20 + Lv() * 0.65, () => 0.12 + Lv() * 0.38, () => 0.08 + Lv() * 0.22)

  // MID1 — pêche / sable chaud
  const jaune = osc(() => 7 + Mv1() * 18, () => Mv1() * 0.55, 0.8)
    .modulate(flowMid, () => Mv1() * 0.035)
    .color(() => 0.20 + Mv1() * 0.60, () => 0.14 + Mv1() * 0.42, () => 0.10 + Mv1() * 0.28)
  const vert = osc(() => 9 + Mv1() * 10, () => Mv1() * 0.40, 1.2)
    .modulate(flowMid, () => Mv1() * 0.03)
    .color(() => 0.08 + Mv1() * 0.20, () => 0.16 + Mv1() * 0.50, () => 0.10 + Mv1() * 0.30)

  // MID2 — cyan/turquoise : haut-médium
  const cyan = osc(() => 12 + Mv2() * 20, () => Mv2() * 0.60, 1.6)
    .modulate(flowMid, () => Mv2() * 0.03)
    .color(0, () => 0.18 + Mv2() * 0.62, () => 0.20 + Mv2() * 0.70)

  // HIGH — bleu/violet : fréquences fines, grain rapide
  const bleu = osc(() => 18 + Hv() * 25, () => Hv() * 0.70, 2.0)
    .modulate(flowHi, () => Hv() * 0.04)
    .color(() => 0.02 + Hv() * 0.06, () => 0.03 + Hv() * 0.12, () => 0.20 + Hv() * 0.75)
  const violet = osc(() => 24 + Hv() * 30, () => Hv() * 0.80, 2.4)
    .modulate(flowHi, () => Hv() * 0.05)
    .color(() => 0.12 + Hv() * 0.58, 0, () => 0.20 + Hv() * 0.75)

  baseBg
    .add(rouge, () => 0.25 + Lv() * 0.75).add(orange, () => 0.20 + Lv() * 0.60)
    .add(jaune, () => 0.25 + Mv1() * 0.75).add(vert, () => 0.20 + Mv1() * 0.60)
    .add(cyan, () => 0.25 + Mv2() * 0.75)
    .add(bleu, () => 0.25 + Hv() * 0.75).add(violet, () => 0.20 + Hv() * 0.60)
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
    .scale(3)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
