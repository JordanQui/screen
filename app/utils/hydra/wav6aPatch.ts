declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  // --- Lissage par bande avec gate silence ---
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
  const ATTACK_E = 0.40, RELEASE_E = 0.025

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
  // BASE PEAU
  // osc très basse fréquence = dégradé doux chaud→sombre
  // + grain de noise pour la texture de surface
  // ============================================================
  // osc basse fréq = dégradé doux chaud d'un côté, sombre de l'autre
  const warmGrad = osc(0.8, 0.001, 0)
    .color(0.92, 0.62, 0.46)
    .brightness(0.04)
    .contrast(0.90)

  // grain de peau : noise moyen très lent
  const skinGrain = noise(5, 0.003)
    .color(0.88, 0.56, 0.38)
    .brightness(-0.05)
    .contrast(1.20)

  const skin = warmGrad.blend(skinGrain, 0.45)

  // ============================================================
  // OMBRES — oscillateurs N&B centrés autour de 0
  //
  // Technique : osc.contrast(élevé).brightness(-0.5) → valeurs ≈ -0.5..+0.5
  // Ajout à la peau : zones neg = ombre, zones pos = reflet
  // Amplitude = 0 au silence (rien n'est ajouté), monte avec chaque bande
  //
  // Le champ de noise déforme les bandes droites → ombres organiques
  // ============================================================

  // LOW : grandes bandes lentes, profondes — pulsent avec les graves
  const warpLow  = noise(() => 0.3 + Lv() * 0.8,  () => Lv() * 0.08)
  const oscLow   = osc(
    () => 2.0 + Lv() * 6.0,
    () => Lv() * 0.30,
    0,
  ).modulate(warpLow, () => 0.10 + Lv() * 0.18)
   .contrast(   () => 3.0 + Lv() * 2.5)
   .brightness(-0.50)

  // MID1 : bandes moyennes, tempo modéré
  const warpMid1 = noise(() => 1.0 + Mv1() * 2.5,  () => Mv1() * 0.18)
  const oscMid1  = osc(
    () => 7.0 + Mv1() * 14.0,
    () => Mv1() * 0.50,
    1.0,
  ).modulate(warpMid1, () => 0.08 + Mv1() * 0.14)
   .contrast(   () => 3.5 + Mv1() * 2.0)
   .brightness(-0.50)

  // MID2 : bandes fines, plus rapides
  const warpMid2 = noise(() => 2.0 + Mv2() * 4.0,  () => Mv2() * 0.25)
  const oscMid2  = osc(
    () => 14.0 + Mv2() * 22.0,
    () => Mv2() * 0.65,
    2.0,
  ).modulate(warpMid2, () => 0.06 + Mv2() * 0.10)
   .contrast(   () => 4.0 + Mv2() * 1.5)
   .brightness(-0.50)

  // HIGH : striures très fines, tremblements rapides des aigus
  const warpHigh = noise(() => 4.0 + Hv() * 8.0,  () => Hv() * 0.45)
  const oscHigh  = osc(
    () => 28.0 + Hv() * 45.0,
    () => Hv() * 0.90,
    3.0,
  ).modulate(warpHigh, () => 0.04 + Hv() * 0.08)
   .contrast(   () => 5.0 + Hv() * 2.5)
   .brightness(-0.50)

  // ============================================================
  // FEEDBACK FORT
  // LOW  → zoom/dilatation
  // MID1 → rotation lente
  // MID2 → warp spatial
  // fbBrightness quasi nulle en audio → traînes longues
  // ============================================================
  const warpFB   = noise(() => 0.5 + (Mv1() + Mv2()) * 2.0, () => (Mv1() + Mv2()) * 0.12)

  const fbScale      = () => 1.000 + Lv()  * 0.022
  const fbRotate     = () => (Mv1() - Lv()) * 0.016
  const fbModAmt     = () => Mv2() * 0.014 + E() * 0.003
  const fbBlend      = () => Math.min(0.94, 0.82 + E() * 0.11)
  const fbBrightness = () => -(0.005 - E() * 0.0044)

  // ============================================================
  // PIPELINE
  // ============================================================
  skin
    .add(oscLow,  () => Lv()  * 0.85)   // ombres graves  — 0 au silence
    .add(oscMid1, () => Mv1() * 0.70)   // ombres mid1    — 0 au silence
    .add(oscMid2, () => Mv2() * 0.60)   // ombres mid2    — 0 au silence
    .add(oscHigh, () => Hv()  * 0.50)   // striures aigus — 0 au silence
    .saturate(  () => 0.70 + E() * 0.50)
    .contrast(  () => 1.05 + E() * 0.35)
    .brightness(() => -0.02 + E() * 0.05)
    .blend(
      src(o0)
        .scale(fbScale)
        .rotate(fbRotate)
        .modulate(warpFB, fbModAmt)
        .brightness(fbBrightness),
      fbBlend,
    )
    .scale(10.0)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
