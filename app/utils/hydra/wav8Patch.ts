import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav8Patch = (api: HydraApi): HydraPatchController => {
  const { noise, src, shape, render, o0, o1 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  function processBand(raw: number): number {
    let v = Math.max(0, raw - 0.005) * 1.5
    v = Math.pow(Math.max(0, v), 2.2)
    return Math.min(1, Math.max(0, v))
  }
  const gv = (x: number) => x

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
  const NOISE_FLOOR = 0.01, ATTACK_COEF = 0.30, RELEASE_COEF = 0.70
  let energy = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low))
    _Mv1 = gv(processBand(bands.mid1))
    _Mv2 = gv(processBand(bands.mid2))
    _Hv = Math.min(1, gv(processBand(bands.high)) * 3)
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

  const w = () => Math.max(0.004, 0.005 + Math.pow(Lv(), 3) * 0.025 - Hv() * 0.003)
  const spread = () => Math.pow(Lv(), 1.5) * 0.40

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

  // Lecture lineaire des bandes pour le tremblement : pas de courbe en puissance,
  // sensible aux sons faibles sans le pow(2.2) de processBand
  const rawLv  = () => Math.min(1, Math.max(0, bands.low  - 0.003) * 2.5)
  const rawMv1 = () => Math.min(1, Math.max(0, bands.mid1 - 0.003) * 2.5)
  const rawMv2 = () => Math.min(1, Math.max(0, bands.mid2 - 0.003) * 2.5)
  const rawHv  = () => Math.min(1, Math.max(0, bands.high - 0.003) * 2.5)

  // Tremblement grave — noise toujours anime, vitesse et amplitude selon les basses
  const bassShake = noise(() => 2 + rawLv() * 7, () => 0.5 + rawLv() * 2.0)
  // Vibration aigue — noise toujours anime, vitesse et amplitude selon les aigus
  const hiVibrate = noise(() => 7 + rawHv() * 8, () => 1.0 + rawHv() * 1.5)

  // --- Anneaux rendus dans o1 (buffer intermediaire, sans scale ni aberration) ---
  rLo1.add(rLo2).add(rM1a).add(rM1b).add(rM2).add(rHi1).add(rHi2)
    .color(() => 1 + E() * 2, () => 1 + E() * 2, () => 1 + E() * 2)
    .modulate(bassShake, () => 0.004 + rawLv() * 0.018)
    .modulate(hiVibrate, () => 0.004 + rawHv() * 0.025)
    .contrast(() => 1.05 + E() * 0.30)
    .brightness(() => -0.01 + E() * 0.15)
    .out(o1)

  // --- Aberration chromatique : decalage X par canal ---
  // Utilise les valeurs raw (lineaires) pour repondre des les sons faibles
  // RED decale droite selon low, GREEN decale gauche selon mid1, BLUE decale gauche selon mid2
  src(o1).color(1, 0, 0).scrollX(() => rawLv() * 0.018)
    .add(src(o1).color(0, 1, 0).scrollX(() => -rawMv1() * 0.010))
    .add(src(o1).color(0, 0, 1).scrollX(() => -rawMv2() * 0.018))
    .scale(4)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
