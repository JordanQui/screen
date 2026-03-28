declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav8Patch = (api: HydraApi): HydraPatchController => {
  const { noise, src, shape, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const _prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - 0.005) * 1.2
    v = Math.pow(Math.max(0, v), 2.2)
    v = Math.min(1, Math.max(0, v))
    const p = _prev[key] || 0
    const s = p + (v - p) * (v > p ? 0.55 : 0.75)
    _prev[key] = s
    return s
  }
  const gv = (x: number) => x

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
  const S = 200, SM = 0.003

  const w = () => Math.max(0.004, 0.005 + Math.pow(Lv(), 2) * 0.05 - Hv() * 0.006)
  const spread = () => Lv() * 0.40

  // Tous les anneaux en blanc pur
  // LOW — 2 anneaux exterieurs
  const rLo1 = shape(S, () => 0.88 + w() + spread(), SM)
    .diff(shape(S, () => 0.88 - w() + spread(), SM))
  const rLo2 = shape(S, () => 0.74 + w() + spread() * 0.85, SM)
    .diff(shape(S, () => 0.74 - w() + spread() * 0.85, SM))

  // MID1 — 2 anneaux mediums
  const rM1a = shape(S, () => 0.60 + w() + spread() * 0.65, SM)
    .diff(shape(S, () => 0.60 - w() + spread() * 0.65, SM))
  const rM1b = shape(S, () => 0.48 + w() + spread() * 0.50, SM)
    .diff(shape(S, () => 0.48 - w() + spread() * 0.50, SM))

  // MID2 — 1 anneau
  const rM2 = shape(S, () => 0.36 + w() + spread() * 0.35, SM)
    .diff(shape(S, () => 0.36 - w() + spread() * 0.35, SM))

  // HIGH — 2 anneaux centraux
  const rHi1 = shape(S, () => 0.24 + w() + spread() * 0.18, SM)
    .diff(shape(S, () => 0.24 - w() + spread() * 0.18, SM))
  const rHi2 = shape(S, () => 0.14 + w() + spread() * 0.08, SM)
    .diff(shape(S, () => 0.14 - w() + spread() * 0.08, SM))

  // Tremblement fort sur les graves
  const bassShake = noise(() => 3 + Lv() * 8, () => Lv() * 1.5)
  // Vibration fine sur les aigus
  const hiVibrate = noise(() => 8 + Hv() * 20, () => Hv() * 1.2)

  // Coloriser chaque groupe : blanc au silence, couleur avec le son
  // LOW — rouge/orange chaud
  rLo1.add(rLo2)
    .color(() => 1 + Lv() * 4, () => 1 - Lv() * 0.8, () => 1 - Lv() * 0.9)
  // MID1 — magenta/rose
  rM1a.add(rM1b)
    .color(() => 1 + Mv1() * 2, () => 1 - Mv1() * 0.7, () => 1 + Mv1() * 1.5)
  // MID2 — bleu/violet
  rM2
    .color(() => 1 + Mv2() * 0.8, () => 1 - Mv2() * 0.6, () => 1 + Mv2() * 3)
  // HIGH — blanc brillant (glow)
  rHi1.add(rHi2)
    .color(() => 1 + Hv() * 3, () => 1 + Hv() * 3, () => 1 + Hv() * 4)

  // Empiler tous les groupes colorises
  rLo1
    .add(rM1a)
    .add(rM2)
    .add(rHi1)
    // Tremblement graves (fort) + vibration aigus (fin)
    .modulate(bassShake, () => Lv() * 0.020)
    .modulate(hiVibrate, () => 0.005 + Hv() * 0.08)
    .contrast(() => 1.05 + E() * 0.30)
    .brightness(() => -0.01 + E() * 0.15)
    // Feedback avec aberration chromatique : R et B decales au son
    .blend(
      src(o0).scale(() => 1.001 + E() * 0.003).color(1, 0, 0)
        .add(src(o0).color(0, 1, 0))
        .add(src(o0).scale(() => 0.999 - E() * 0.003).color(0, 0, 1))
        .brightness(-0.012)
        .contrast(1.001),
      () => 0.20 + E() * 0.40,
    )
    .scale(2)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
