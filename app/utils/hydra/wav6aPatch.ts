declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const NOISE_FLOOR = 0.003
  const ATTACK = 0.50, RELEASE = 0.96
  const SILENCE_GATE = 0.010, SILENCE_FRAMES = 3
  const _prev: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const _sil:  Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }

  function processBand(raw: number, key: string): number {
    let v = Math.max(0, raw - NOISE_FLOOR) * 1.4
    v = Math.pow(Math.max(0, v), 0.75)
    v = Math.min(1, Math.max(0, v))
    if (v < SILENCE_GATE) { _sil[key] = (_sil[key] ?? 0) + 1; if ((_sil[key] ?? 0) >= SILENCE_FRAMES) v = 0 }
    else { _sil[key] = 0 }
    const p = _prev[key] ?? 0
    _prev[key] = p + (v - p) * (v > p ? ATTACK : RELEASE)
    return _prev[key]!
  }

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0, _E = 0
  const ATTACK_E = 0.40, RELEASE_E = 0.045

  const updateBands = () => {
    _Lv  = processBand(bands.low,  'low')
    _Mv1 = processBand(bands.mid1, 'mid1')
    _Mv2 = processBand(bands.mid2, 'mid2')
    _Hv  = processBand(bands.high, 'high')
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hv)
    _E += (raw - _E) * (raw > _E ? ATTACK_E : RELEASE_E)
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2, Hv = () => _Hv, E = () => _E

  // ============================================================
  // OSCILLATEURS — couleurs saturées par bande
  // LOW  → rouge/orange vif
  // MID1 → jaune/lime
  // MID2 → cyan/électrique
  // HIGH → magenta
  // ============================================================

  const warpLow  = noise(() => 0.5 + Lv() * 1.5,  () => Lv() * 0.10)
  const oscLow   = osc(
    () => 2.0 + Lv() * 8.0,
    () => Lv() * 0.30,
    0,
  ).modulate(warpLow, () => 0.08 + Lv() * 0.20)
   .color(() => Lv() * 3.5, () => Lv() * 0.6, () => 0)

  const warpMid1 = noise(() => 1.2 + Mv1() * 3.0,  () => Mv1() * 0.20)
  const oscMid1  = osc(
    () => 8.0 + Mv1() * 18.0,
    () => Mv1() * 0.55,
    1.0,
  ).modulate(warpMid1, () => 0.06 + Mv1() * 0.16)
   .color(() => Mv1() * 2.8, () => Mv1() * 3.5, () => 0)

  const warpMid2 = noise(() => 2.5 + Mv2() * 5.0,  () => Mv2() * 0.30)
  const oscMid2  = osc(
    () => 16.0 + Mv2() * 26.0,
    () => Mv2() * 0.70,
    2.0,
  ).modulate(warpMid2, () => 0.05 + Mv2() * 0.12)
   .color(() => 0, () => Mv2() * 2.8, () => Mv2() * 4.0)

  const warpHigh = noise(() => 5.0 + Hv() * 10.0,  () => Hv() * 0.50)
  const oscHigh  = osc(
    () => 30.0 + Hv() * 50.0,
    () => Hv() * 0.95,
    3.0,
  ).modulate(warpHigh, () => 0.03 + Hv() * 0.09)
   .color(() => Hv() * 3.5, () => 0, () => Hv() * 3.5)

  // ============================================================
  // GLITCH — champs de déplacement pour le modulate
  // glitchCoarse : déplacement brut basse-fréquence (pixels qui sautent en blocs)
  // glitchFine   : striures fines réactives aux aigus
  // ============================================================

  const glitchCoarse = noise(
    () => 1.5 + Lv() * 5.0,
    () => (Lv() + Mv1()) * 0.35,
  )

  const glitchFine = noise(
    () => 8.0 + Hv() * 20.0,
    () => Hv() * 0.60,
  )

  // ============================================================
  // FEEDBACK
  // fbBlend élevé = longues traînes
  // modulate(src(o0), ...) dans le feedback = auto-déplacement récursif = glitch
  // ============================================================

  const fbBlend      = () => { const e = E(); const floor = Math.min(0.55, e * 28); return e > 0.05 ? Math.min(0.93, 0.80 + e * 0.13) : floor }
  const fbScale      = () => 1.000 + Lv() * 0.030
  const fbRotate     = () => (Mv1() - Lv()) * 0.022
  const fbBrightness = () => -(0.006 - E() * 0.005)

  // ============================================================
  // PIPELINE
  // ============================================================
  oscLow
    .add(oscMid1, () => Mv1() * 0.95)
    .add(oscMid2, () => Mv2() * 0.95)
    .add(oscHigh, () => Hv()  * 0.85)
    // Glitch 1 : champ noise déforme le signal courant en blocs
    .modulate(glitchCoarse, () => (Lv() + Mv1()) * 0.10)
    // Glitch 2 : le feedback auto-déplace le signal = larsen visuel
    .modulate(src(o0), () => (Mv2() + Hv()) * 0.06)
    // Striures fines sur les aigus
    .modulate(glitchFine, () => Hv() * 0.12)
    .saturate(() => 1.8 + E() * 2.5)
    .contrast(() => 1.2 + E() * 0.7)
    .brightness(() => -0.08 + E() * 0.06)
    .blend(
      src(o0)
        .scale(fbScale)
        .rotate(fbRotate)
        // Warp du feedback par le noise → traînes qui bougent
        .modulate(glitchCoarse, () => (Mv1() + Mv2()) * 0.035 + Lv() * 0.055)
        // Auto-warp récursif du feedback = glitch de feedback
        .modulate(src(o0), () => Hv() * 0.09 + Mv2() * 0.04)
        .brightness(fbBrightness),
      fbBlend,
    )
    .scale(20.0)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
