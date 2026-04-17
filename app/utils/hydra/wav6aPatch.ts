declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController, TimeColorTint } from './types'

export const createWav6aPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let _tc: TimeColorTint = [1, 1, 1]
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L   = () => bands.low
  const M1  = () => bands.mid1
  const M2  = () => bands.mid2
  const Hh  = () => bands.high
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

  // Couleurs par bande — bien séparées
  const C_LOW: [number, number, number] = [1.00, 0.42, 0.00]   // orange vif
  const C_M1:  [number, number, number] = [0.00, 1.00, 0.55]   // vert/cyan
  const C_M2:  [number, number, number] = [0.48, 0.36, 1.00]   // violet/indigo
  const C_HI:  [number, number, number] = [1.00, 0.85, 0.27]   // jaune chaud

  const Hsoft = () => Math.pow(clamp01(Hh()), 0.72)

  // ============================================================
  // FRÉQUENCES — les aigus augmentent la fréquence de TOUS les oscis
  // Chaque bande pilote sa propre gamme + apport des aigus
  // ============================================================
  const fLow  = () => 8  + L()      * 22 + Hsoft() * 6
                        + (L()  * 3.0) * (Math.sin(time * 0.90) + Math.sin(time * 1.457)) * 0.5
  const fM1   = () => 11 + M1()     *  8 + Hsoft() * 8
                        + (M1() * 2.4) * (Math.sin(time * 1.00) + Math.sin(time * 1.618)) * 0.5
  const fM2   = () => 15 + M2()     * 10 + Hsoft() * 10
                        + (M2() * 2.8) * (Math.sin(time * 1.20) + Math.sin(time * 1.946)) * 0.5
  const fHigh = () => Math.min(
    18 + Hsoft() * 28 + (Hsoft() * 3.2) * (Math.sin(time * 1.9) + Math.sin(time * 2.89)) * 0.5,
    38,
  )

  // ============================================================
  // BASE COULEUR — zéro au silence, couleur saturée dès que la bande joue
  // Multiplicateur élevé (3.0) pour que les couleurs claquent
  // ============================================================
  const bL  = () => Math.min(1, L()      * 3.0)
  const bM1 = () => Math.min(1, M1()     * 3.0)
  const bM2 = () => Math.min(1, M2()     * 3.0)
  const bHi = () => Math.min(1, Hsoft()  * 3.5)

  const lowL = osc(fLow,  0, 0).color(() => bL()  * C_LOW[0], () => bL()  * C_LOW[1], () => bL()  * C_LOW[2])
  const m1L  = osc(fM1,   0, 0).color(() => bM1() * C_M1[0],  () => bM1() * C_M1[1],  () => bM1() * C_M1[2])
  const m2L  = osc(fM2,   0, 0).color(() => bM2() * C_M2[0],  () => bM2() * C_M2[1],  () => bM2() * C_M2[2])
  const hiL  = osc(fHigh, 0, 0).color(() => bHi() * C_HI[0],  () => bHi() * C_HI[1],  () => bHi() * C_HI[2])

  // ============================================================
  // CHAMP DE FLOW — modulé par l'énergie globale
  // ============================================================
  let _warmGate = 0
  let warmFrames = 0
  let warmId: number | null = null
  const warmStep = () => {
    warmFrames++
    if (warmFrames >= 2) _warmGate = 1
    else warmId = requestAnimationFrame(warmStep)
  }
  warmId = requestAnimationFrame(warmStep)

  const flow = noise(
    () => 1.25 + (M1() + M2() + Hh()) * 2.2,
    () => (0.05 + Hh() * 0.40) * _warmGate,
  )
  const flowAmt = () => (0.010 + (L() + M1() + M2()) * 0.015 + Hsoft() * 0.026) * _warmGate

  // ============================================================
  // PIPELINE
  // Add amounts réactifs : chaque bande n'apparaît que quand elle joue
  // fbAmt sans base fixe → noir au silence
  // ============================================================
  const fbAmt = () => Math.min(0.20, (L() + M1() + M2() + Hsoft()) * 0.12) * _warmGate

  lowL
    .add(m1L,  () => Math.min(1, M1() * 4.0))
    .add(m2L,  () => Math.min(1, M2() * 4.0))
    .add(hiL,  () => Math.min(1, Hsoft() * 4.0))
    .saturate(1.5)
    .contrast(1.4)
    .modulate(flow, flowAmt)
    .scrollX(() => (M2() - L())  * 0.0022)
    .scrollY(() => (M1() - Hh()) * 0.0022)
    .blend(
      src(o0)
        .colorama(() => 0.004 + Hh() * 0.018)
        .contrast(1.0005),
      fbAmt,
    )
    .luma(0.12, 0.08)
    .brightness(-0.08)
    .scale(2)
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
    stop: () => { if (warmId !== null) cancelAnimationFrame(warmId) },
  }
}
