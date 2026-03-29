declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav7cPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  function processBand(raw: number): number {
    let v = Math.max(0, raw - 0.005) * 22.0
    v = Math.pow(Math.max(0, v), 0.65)
    return Math.min(1, Math.max(0, v))
  }
  const gv = (x: number) => Math.pow(Math.max(0, x), 0.75)

  let _Lv = 0, _Mv1 = 0, _Mv2 = 0, _Hv = 0, _Hsens = 0
  const H_GAIN = 1.8, H_GAMMA = 0.60
  const NOISE_FLOOR = 0.01, SILENCE_GATE = 0.04, ATTACK_COEF = 0.30, RELEASE_COEF = 0.70
  let energy = 0

  const updateBands = () => {
    _Lv = gv(processBand(bands.low))
    _Mv1 = gv(processBand(bands.mid1))
    _Mv2 = gv(processBand(bands.mid2))
    _Hv = gv(processBand(bands.high))
    _Hsens = Math.min(1, Math.pow(Math.max(0, _Hv), H_GAMMA) * H_GAIN)
    const raw = Math.max(_Lv, _Mv1, _Mv2, _Hsens)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = Math.min(1, above)
    const coef = target > energy ? ATTACK_COEF : RELEASE_COEF
    energy += (target - energy) * coef
    updateSmooth()
    frameId = requestAnimationFrame(updateBands)
  }
  frameId = requestAnimationFrame(updateBands)

  // Valeurs brutes pour la couleur (reactives)
  const Lv = () => _Lv, Mv1 = () => _Mv1, Mv2 = () => _Mv2
  const Hsens = () => _Hsens, E = () => energy

  // Valeurs lissees pour le mouvement (douces)
  let _sLv = 0, _sMv1 = 0, _sMv2 = 0, _sHs = 0
  const SMOOTH = 0.08
  const updateSmooth = () => {
    _sLv += (_Lv - _sLv) * SMOOTH
    _sMv1 += (_Mv1 - _sMv1) * SMOOTH
    _sMv2 += (_Mv2 - _sMv2) * SMOOTH
    _sHs += (_Hsens - _sHs) * SMOOTH
  }
  const sLv = () => _sLv, sMv1 = () => _sMv1, sMv2 = () => _sMv2, sHs = () => _sHs
  const FB_G = () => { const x = Math.max(0, energy - SILENCE_GATE) / (1 - SILENCE_GATE); return Math.pow(x, 1.2) }

  // Frequences osc lissees (mouvement doux)
  const fLow = () => 6 + sLv() * 10 + (sLv() * 1.5) * (Math.sin(time * 0.9) + Math.sin(time * 1.31)) * 0.5
  const fM1 = () => 9 + sMv1() * 6 + sMv1() * (Math.sin(time * 1.1) + Math.sin(time * 1.77)) * 0.5
  const fM2 = () => 12 + sMv2() * 8 + sMv2() * 1.2 * (Math.sin(time * 1.3) + Math.sin(time * 2.03)) * 0.5

  // Chaque bande colore son oscillateur (couleur brute = reactive)
  // LOW — rouge/orange chaud
  const oscLo = osc(() => fLow(), 0, () => sLv() * 0.25)
    .color(() => 1.0 + Lv() * 2.0, () => 1.0 - Lv() * 0.4, () => 1.0 - Lv() * 0.6)
  // MID1 — jaune/peche
  const oscM1 = osc(fM1, 0, 1)
    .color(() => 1.0 + Mv1() * 1.5, () => 1.0 + Mv1() * 0.8, () => 1.0 - Mv1() * 0.5)
  // MID2 — cyan/turquoise
  const oscM2 = osc(fM2, 0, 1)
    .color(() => 1.0 - Mv2() * 0.5, () => 1.0 + Mv2() * 1.2, () => 1.0 + Mv2() * 1.5)
  // HIGH — violet/magenta
  const oscHi = osc(() => 60 + sHs() * 50, () => 0.02 + sHs() * 0.12, () => sHs() * 32)
    .color(() => 1.0 + Hsens() * 1.5, () => 1.0 - Hsens() * 0.6, () => 1.0 + Hsens() * 2.2)

  const base = oscLo
    .add(oscM1, 0.6)
    .add(oscM2, 0.6)
    .add(oscHi, () => sHs() * 0.4)
    .contrast(() => 1.03 + sLv() * 0.4)
    .brightness(-0.5)

  // Noise lisse pour mouvement doux
  const coarseNoise = noise(() => 0.5 + (sLv() + sMv1()) * 2.0, () => 0.08 + sLv() * 0.20)
  const fineNoise = noise(() => 0.24 + sHs() * 5, () => 0.6 + sHs() * 0.70)

  const field = coarseNoise.add(fineNoise, () => 0.35 + sHs() * 0.65)
    .contrast(() => 1.0 + sLv() * 0.08 + sHs() * 0.08)

  base
    // Modulation lissee (mouvement doux)
    .modulate(field, () => (0.005 + (sLv() + sMv1()) * 0.018) * FB_G())
    .add(fineNoise, () => (0.02 + sHs() * 0.28) * FB_G())
    // Contrast/brightness reactifs aux couleurs (brut)
    .contrast(() => 1.01 + Hsens() * 0.12)
    .brightness(() => -0.06 - Hsens() * 0.06)
    .add(
      src(o0)
        .modulate(field, () => (0.006 + sLv() * 0.02) * FB_G())
        // Colorama reactif (brut) pour couleur
        .colorama(() => (0.08 + Hsens() * 1.4) * FB_G())
        .contrast(() => 1.003 + Hsens() * 0.005),
      () => Math.min(0.38, (0.06 + (sLv() + sMv1()) * 0.18) * FB_G()),
    )
    .brightness(-0.25)
    .luma(() => 0.75 - sHs() * 0.45 + sLv() * 0.05)
    .blend(o0)
    .scale(() => 16 + sLv() * 1.5)
    .scale(0.14)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
