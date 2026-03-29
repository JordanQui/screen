declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav8Patch = (api: HydraApi): HydraPatchController => {
  const { noise, src, shape, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  function processBand(raw: number): number {
    let v = Math.max(0, raw - 0.005) * 2.2
    v = Math.pow(Math.max(0, v), 2.2)
    return Math.min(1, Math.max(0, v))
  }
  const gv = (x: number) => x

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
  const NOISE_FLOOR = 0.01, SILENCE_GATE = 0.04, ATTACK_COEF = 0.30, RELEASE_COEF = 0.70
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
  const hiVibrate = noise(() => 8 + Hv() * 10, () => Hv() * 0.2)

  // Empiler tous les anneaux en blanc pur
  rLo1.add(rLo2).add(rM1a).add(rM1b).add(rM2).add(rHi1).add(rHi2)
    .color(() => 1 + E() * 2, () => 1 + E() * 2, () => 1 + E() * 2)
    // Tremblement graves (fort) + vibration aigus (fin)
    .modulate(bassShake, () => Lv() * 0.020)
    .modulate(hiVibrate, () => 0.003 + Hv() * 0.03)
    .contrast(() => 1.05 + E() * 0.30)
    .brightness(() => -0.01 + E() * 0.15)
    // Aberration chromatique dans le feedback : chaque bande decale un canal RGB
    .blend(
      // RED decale par LOW (pousse vers l'exterieur)
      src(o0).scale(() => 1.003 + Lv() * 0.04).color(1, 0, 0)
        // GREEN decale par MID1+MID2
        .add(src(o0).scale(() => 1.0 + (Mv1() + Mv2()) * 0.015).color(0, 1, 0))
        // BLUE decale par HIGH (pousse vers l'interieur)
        .add(src(o0).scale(() => 0.999 - Hv() * 0.015).color(0, 0, 1))
        .brightness(() => -0.008 - E() * 0.004)
        .contrast(1.002),
      () => 0.55 + E() * 0.35,
    )
    .scale(4)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
