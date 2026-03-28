declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav8Patch = (api: HydraApi): HydraPatchController => {
  const { noise, src, shape, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const _prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - 0.005) * 22.0
    v = Math.pow(Math.max(0, v), 0.65)
    v = Math.min(1, Math.max(0, v))
    const p = _prev[key] || 0
    const s = p + (v - p) * (v > p ? 0.55 : 0.75)
    _prev[key] = s
    return s
  }
  const gv = (x: number) => Math.pow(Math.max(0, x), 0.75)

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
  const NOISE_FLOOR = 0.01, SILENCE_GATE = 0.04, ATTACK_COEF = 0.30, RELEASE_COEF = 0.70
  let energy = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low, 'low'))
    _Mv1 = gv(processBand(bands.mid1, 'mid1'))
    _Mv2 = gv(processBand(bands.mid2, 'mid2'))
    _Hv = gv(processBand(bands.high, 'high'))
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hv)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = Math.min(1, above)
    const coef = target > energy ? ATTACK_COEF : RELEASE_COEF
    energy += (target - energy) * coef
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv
  const E = () => energy

  // --- Cercles concentriques : exterieur=LOW, centre=HIGH ---
  // Chaque anneau = shape(outer).diff(shape(inner))
  // Le rayon pulse avec la bande de frequence associee
  const S = 200, SM = 0.003

  // Epaisseur de base, retrecit sur les aigus
  const w = () => Math.max(0.004, 0.015 + Lv() * 0.035 - Hv() * 0.010)
  // Basses ecartent fortement les anneaux
  const spread = () => Lv() * 0.40

  // LOW — 2 anneaux exterieurs (rouge/orange chaud)
  const rLo1 = shape(S, () => 0.88 + w() + spread(), SM)
    .diff(shape(S, () => 0.88 - w() + spread(), SM))
    .color(() => 1.0 + Lv() * 0.5, () => 1.0 - Lv() * 0.80, () => 1.0 - Lv() * 0.90)
  const rLo2 = shape(S, () => 0.74 + w() + spread() * 0.85, SM)
    .diff(shape(S, () => 0.74 - w() + spread() * 0.85, SM))
    .color(() => 1.0 + Lv() * 0.4, () => 1.0 - Lv() * 0.75, () => 1.0 - Lv() * 0.85)

  // MID1 — 2 anneaux mediums (blanc → violet)
  const rM1a = shape(S, () => 0.60 + w() + spread() * 0.65, SM)
    .diff(shape(S, () => 0.60 - w() + spread() * 0.65, SM))
    .color(() => 1.0 - Mv1() * 0.35, () => 1.0 - Mv1() * 0.80, () => 1.0 + Mv1() * 0.2)
  const rM1b = shape(S, () => 0.48 + w() + spread() * 0.50, SM)
    .diff(shape(S, () => 0.48 - w() + spread() * 0.50, SM))
    .color(() => 1.0 - Mv1() * 0.30, () => 1.0 - Mv1() * 0.85, () => 1.0 + Mv1() * 0.2)

  // MID2 — 1 anneau (blanc → indigo)
  const rM2 = shape(S, () => 0.36 + w() + spread() * 0.35, SM)
    .diff(shape(S, () => 0.36 - w() + spread() * 0.35, SM))
    .color(() => 1.0 - Mv2() * 0.55, () => 1.0 - Mv2() * 0.90, () => 1.0 + Mv2() * 0.2)

  // HIGH — 2 anneaux centraux (blanc → bleu profond)
  // HIGH — glow : anneau net + halo flou superpose
  const rHi1 = shape(S, () => 0.24 + w() + spread() * 0.18, SM)
    .diff(shape(S, () => 0.24 - w() + spread() * 0.18, SM))
    .color(() => 1.0 - Lv() * 0.45 + Hv() * 1.5, () => 1.0 - Lv() * 0.75 + Hv() * 1.5, () => 1.0 + Lv() * 0.3 + Hv() * 1.5)
  const rHi1Glow = shape(S, () => 0.24 + w() * 3 + spread() * 0.18, 0.06)
    .diff(shape(S, () => 0.24 - w() * 3 + spread() * 0.18, 0.06))
    .color(() => Lv() * 0.3 + Hv() * 0.6, () => Lv() * 0.15 + Hv() * 0.6, () => Lv() * 0.5 + Hv() * 0.6)
  const rHi2 = shape(S, () => 0.14 + w() + spread() * 0.08, SM)
    .diff(shape(S, () => 0.14 - w() + spread() * 0.08, SM))
    .color(() => 1.0 + Hv() * 1.5, () => 1.0 + Hv() * 1.5, () => 1.0 + Hv() * 1.5)
  const rHi2Glow = shape(S, () => 0.14 + w() * 3 + spread() * 0.08, 0.06)
    .diff(shape(S, () => 0.14 - w() * 3 + spread() * 0.08, 0.06))
    .color(() => Hv() * 0.6, () => Hv() * 0.6, () => Hv() * 0.6)

  // Vibration haute frequence : bruit rapide module par les aigus
  const hiVibrate = noise(() => 8 + Hv() * 20, () => Hv() * 1.2)

  // Empiler tous les anneaux + feedback
  rLo1
    .add(rLo2)
    .add(rM1a)
    .add(rM1b)
    .add(rM2)
    .add(rHi1Glow)
    .add(rHi1)
    .add(rHi2Glow)
    .add(rHi2)
    // Vibration legere sur les aigus
    .modulate(hiVibrate, () => 0.0005 + Hv() * 0.008)
    .contrast(() => 1.05 + E() * 0.15)
    .brightness(-0.01)
    // Feedback calme, focus anneaux
    .blend(
      src(o0)
        .scale(() => 1.004 + Hv() * 0.008)
        .brightness(-0.012)
        .contrast(1.001),
      () => 0.30 + Hv() * 0.45,
    )
    .scale(3.8)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
