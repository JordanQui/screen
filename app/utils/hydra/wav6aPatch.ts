declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const NOISE_FLOOR = 0.0025, GAIN = 1.7, GAMMA = 1.0

  function processBand(raw: number): number {
    let v = Math.max(0, raw - NOISE_FLOOR) * GAIN
    v = Math.pow(Math.max(0, v), GAMMA)
    return Math.min(1, Math.max(0, v))
  }

  const gv = (x: number) => Math.pow(Math.max(0, x), 0.75)
  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0, _E = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low))
    _Mv1 = gv(processBand(bands.mid1))
    _Mv2 = gv(processBand(bands.mid2))
    _Hv = Math.min(1, gv(processBand(bands.high)) * 2.5)
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hv)
    _E += (raw - _E) * (raw > _E ? 0.40 : 0.90)
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv, E = () => _E

  const flowLo = noise(() => 0.2 + Lv() * 1.5, () => Lv() * 0.15)
  const flowHi = noise(() => 0.8 + Hv() * 4.0, () => Hv() * 0.30)

  const baseBg = noise(() => 0.20 + E() * 0.40, () => E() * 0.17)
    .color(0.04, 0.03, 0.07).brightness(0.02).contrast(0.95)

  // Texture commune : frequence basse sur graves, haute sur aigus
  const texture = osc(() => 4 + Lv() * 4 + Hv() * 25, () => E() * 0.3, 0)
    .modulate(flowLo, () => E() * 0.04)
    .modulate(flowHi, () => Hv() * 0.02)

  // Couleur pilotee par la bande dominante : gradient mouvant
  // Au silence → sombre, chaque bande pousse sa teinte
  const total = () => Math.max(0.001, Lv() + Mv1() + Mv2() + Hv())
  // Poids normalises de chaque bande
  const wL = () => Lv() / total()
  const wM1 = () => Mv1() / total()
  const wM2 = () => Mv2() / total()
  const wH = () => Hv() / total()

  // LOW=rouge chaud, MID1=peche/orange, MID2=cyan, HIGH=bleu/violet
  const cR = () => wL() * 0.85 + wM1() * 0.70 + wM2() * 0.05 + wH() * 0.15
  const cG = () => wL() * 0.25 + wM1() * 0.45 + wM2() * 0.65 + wH() * 0.08
  const cB = () => wL() * 0.12 + wM1() * 0.30 + wM2() * 0.75 + wH() * 0.85

  baseBg
    .add(texture, () => 0.3 + E() * 0.7)
    .color(() => cR() * E() * 2.5, () => cG() * E() * 2.5, () => cB() * E() * 2.5)
    .saturate(() => 0.8 + E() * 0.8)
    .contrast(() => 1.15 + E() * 0.80)
    .brightness(() => 0.01 + E() * 0.06)
    .scrollX(() => (Mv2() - Lv()) * 0.0020)
    .scrollY(() => (Mv1() - Hv()) * 0.0020)
    .blend(
      src(o0).scale(() => 1.002 + E() * 0.004).rotate(() => (Hv() - Lv()) * 0.006).colorama(() => 0.002 + E() * 0.014).contrast(1.0006),
      () => Math.min(0.18, 0.03 + E() * 0.12),
    )
    .scale(5)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
