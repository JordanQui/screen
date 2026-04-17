declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController, TimeColorTint } from './types'

export const createWav9Patch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  let _tc: TimeColorTint = [1, 1, 1]
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  // Sensibilité basse → pilote les fréquences des waveFields (ne s'emballe pas)
  function processBand(raw: number): number {
    let v = Math.max(0, raw - 0.005) * 0.1
    v = Math.pow(Math.max(0, v), 0.65)
    return Math.min(1, Math.max(0, v))
  }

  // Sensibilité visuelle → pilote les couleurs et la brightness (noir au silence, visible à faible volume)
  function processBandVisual(raw: number): number {
    let v = Math.max(0, raw - 0.003) * 2.0
    v = Math.pow(Math.max(0, v), 0.50)
    return Math.min(1, Math.max(0, v))
  }

  // Les hautes fréquences ont une amplitude naturellement plus faible
  function processBandHigh(raw: number): number {
    let v = Math.max(0, raw - 0.003) * 3.5
    v = Math.pow(Math.max(0, v), 0.50)
    return Math.min(1, Math.max(0, v))
  }

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0
  let _vLv = 0, _vMv1 = 0, _vMv2 = 0
  const ATTACK = 0.85, RELEASE = 0.75
  const SILENCE_GATE = 0.05
  let energy = 0

  const updateBands = () => {
    const rL  = processBand(bands.low)
    const rM1 = processBand(bands.mid1)
    const rM2 = processBand(bands.mid2)
    const rH  = processBandHigh(bands.high)
    _Lv  += (rL  - _Lv)  * (rL  > _Lv  ? ATTACK : RELEASE)
    _Mv1 += (rM1 - _Mv1) * (rM1 > _Mv1 ? ATTACK : RELEASE)
    _Mv2 += (rM2 - _Mv2) * (rM2 > _Mv2 ? ATTACK : RELEASE)
    _Hv  += (rH  - _Hv)  * (rH  > _Hv  ? ATTACK : RELEASE)
    const vL  = processBandVisual(bands.low)
    const vM1 = processBandVisual(bands.mid1)
    const vM2 = processBandVisual(bands.mid2)
    _vLv  += (vL  - _vLv)  * (vL  > _vLv  ? ATTACK : RELEASE)
    _vMv1 += (vM1 - _vMv1) * (vM1 > _vMv1 ? ATTACK : RELEASE)
    _vMv2 += (vM2 - _vMv2) * (vM2 > _vMv2 ? ATTACK : RELEASE)
    const raw = Math.max(_vLv, _vMv1, _vMv2, _Hv)
    energy += (raw - energy) * (raw > energy ? 0.85 : 0.70)
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  const Lv  = () => _Lv   // faible sensibilité → waveFields
  const Mv1 = () => _Mv1
  const Mv2 = () => _Mv2
  const Hv  = () => _Hv   // haute sensibilité → waveField high + couleurs
  const vLv  = () => _vLv  // sensibilité visuelle → couleurs LOW/MID
  const vMv1 = () => _vMv1
  const vMv2 = () => _vMv2
  const E   = () => energy

  const isActive = () => energy > SILENCE_GATE
  const FB_G = () => {
    if (!isActive()) return 0
    return Math.pow((energy - SILENCE_GATE) / (1 - SILENCE_GATE), 1.2)
  }

  // ============================================================
  // CHAMPS DE VAGUE — noise lent pour plier les oscillateurs
  // Chaque bande a son propre champ : fréquence spatiale proportionnelle
  // ============================================================

  // Champ lent et large pour les graves
  const waveFieldLow  = noise(() => 0.18 + Lv()  * 0.015, 0)
  // Champ moyen
  const waveFieldMid1 = noise(() => 0.15 + Mv1() * 0.025, 0)
  const waveFieldMid2 = noise(() => 0.5 + Mv2() * 0.035, 0)
  // Champ rapide et fin pour les aigus
  const waveFieldHigh = noise(() => 0.8 + Hv()  * 0.080, 0)

  // ============================================================
  // OSCILLATEURS — fréquence calée sur la bande, modulés en vagues
  // LOW  → grandes ondulations lentes   → rouge
  // MID1 → vagues moyennes              → vert
  // MID2 → vagues intermédiaires        → jaune/orange
  // HIGH → vagues fines et rapides      → violet pur
  // ============================================================

  // LOW : 2–4 bandes — grandes ondulations → rouge
  const oscLow = osc(() => 2.0 + Lv() * 2.5, 0, 0)
    .modulate(waveFieldLow, () => 0.25 + Lv() * 0.55)
    .color(
      () => vLv() * 3.5,
      () => 0,
      () => 0,
    )
    .contrast(() => 1.2 + vLv() * 2.0)
    .brightness(() => -0.3 + vLv() * 0.35)

  // MID1 : 5–10 bandes — vagues moyennes → vert
  const oscMid1 = osc(() => 5.0 + Mv1() * 6.0, 0, 1.0)
    .modulate(waveFieldMid1, () => 0.18 + Mv1() * 0.40)
    .color(
      () => 0,
      () => vMv1() * 3.5,
      () => 0,
    )
    .contrast(() => 1.2 + vMv1() * 2.0)
    .brightness(() => -0.15 + vMv1() * 0.45)

  // MID2 : 11–18 bandes — vagues intermédiaires → jaune/orange
  const oscMid2 = osc(() => 11.0 + Mv2() * 8.0, 0, 2.0)
    .modulate(waveFieldMid2, () => 0.12 + Mv2() * 0.30)
    .color(
      () => vMv2() * 3.0,
      () => vMv2() * 2.0,
      () => 0,
    )
    .contrast(() => 1.2 + vMv2() * 2.0)
    .brightness(() => -0.15 + vMv2() * 0.45)

  // HIGH : 22–38 bandes — vagues fines et serrées → violet pur
  const oscHigh = osc(() => 22.0 + Hv() * 16.0, 0, 3.0)
    .modulate(waveFieldHigh, () => 0.08 + Hv() * 0.22)
    .color(
      () => Hv() * 0.5,
      () => 0,
      () => Hv() * 5.5,
    )
    .contrast(() => 1.4 + Hv() * 2.0)
    .brightness(0)

  const combined = oscLow
    .add(oscMid1, () => Math.min(1, vMv1() * 2.0))
    .add(oscMid2, () => Math.min(1, vMv2() * 2.0))
    .add(oscHigh, () => Math.min(1, Hv()   * 2.0))
    .contrast(() => 1.1 + E() * 0.8)
    .brightness(() => -0.2 + E() * 0.25)

  // ============================================================
  // FEEDBACK — persistance pure
  // Champs noise indépendants pour warper le frame précédent
  // ============================================================
  const fbWarpSlow = noise(1.2, 0.015)
  const fbWarpFast = noise(4.5, 0.04)

  const fbBlend = () => isActive()
    ? Math.min(0.95, 0.82 + E() * 0.13)
    : 0.30

  combined
    .blend(
      src(o0)
        .modulate(fbWarpSlow, () => vLv()  * 0.04 * FB_G())
        .modulate(fbWarpFast, () => Hv()   * 0.03 * FB_G())
        .brightness(() => -(0.006 - E() * 0.005)),
      fbBlend,
    )
    .color(
      () => 1.0 + (_tc[0] - 1.0) * 0.50,
      () => 1.0 + (_tc[1] - 1.0) * 0.50,
      () => 1.0 + (_tc[2] - 1.0) * 0.50,
    )
    .out(o0)

  render(o0)

  return {
    setBands,
    setColors: (t: TimeColorTint) => { _tc = t },
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
