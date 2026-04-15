declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController, TimeColorTint } from './types'

export const createWav8Patch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let _tc: TimeColorTint = [1, 1, 1]
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L   = () => bands.low
  const M1  = () => bands.mid1
  const M2  = () => bands.mid2
  const Hh  = () => bands.high
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

  // --- Palette froide / électrique ---
  const C_LOW: [number, number, number] = [0.08, 0.38, 1.00]   // bleu électrique
  const C_M1:  [number, number, number] = [1.00, 0.08, 0.60]   // magenta intense
  const C_M2:  [number, number, number] = [0.00, 0.92, 0.88]   // cyan vif
  const C_HI:  [number, number, number] = [0.88, 0.72, 1.00]   // blanc violacé

  const Hsoft = () => Math.pow(clamp01(Hh()), 0.72)

  // --- Fréquences oscillateurs — plage serrée pour jouer avec le zoom fort ---
  const fLow  = () => 7  + L()      * 20 + Hsoft() * 5
                        + (L()  * 2.8) * (Math.sin(time * 0.75) + Math.sin(time * 1.31))  * 0.5
  const fM1   = () => 10 + M1()     *  8 + Hsoft() * 7
                        + (M1() * 2.2) * (Math.sin(time * 0.90) + Math.sin(time * 1.49))  * 0.5
  const fM2   = () => 14 + M2()     * 10 + Hsoft() * 9
                        + (M2() * 2.6) * (Math.sin(time * 1.15) + Math.sin(time * 1.78))  * 0.5
  const fHigh = () => Math.min(
    17 + Hsoft() * 26 + (Hsoft() * 3.5) * (Math.sin(time * 1.85) + Math.sin(time * 2.73)) * 0.5,
    40,
  )

  // --- Activation couleurs — réactives, noires au silence ---
  const bL  = () => Math.min(1, L()     * 4.0)
  const bM1 = () => Math.min(1, M1()    * 4.0)
  const bM2 = () => Math.min(1, M2()    * 4.0)
  const bHi = () => Math.min(1, Hsoft() * 4.5)

  const lowL = osc(fLow,  0, 0).color(() => bL()  * C_LOW[0], () => bL()  * C_LOW[1], () => bL()  * C_LOW[2])
  const m1L  = osc(fM1,   0, 0).color(() => bM1() * C_M1[0],  () => bM1() * C_M1[1],  () => bM1() * C_M1[2])
  const m2L  = osc(fM2,   0, 0).color(() => bM2() * C_M2[0],  () => bM2() * C_M2[1],  () => bM2() * C_M2[2])
  const hiL  = osc(fHigh, 0, 0).color(() => bHi() * C_HI[0],  () => bHi() * C_HI[1],  () => bHi() * C_HI[2])

  // --- Warm gate ---
  let _warmGate = 0
  let warmFrames = 0
  let warmId: number | null = null
  const warmStep = () => {
    warmFrames++
    if (warmFrames >= 2) _warmGate = 1
    else warmId = requestAnimationFrame(warmStep)
  }
  warmId = requestAnimationFrame(warmStep)

  // --- Double champ de flow : lent (graves) + rapide (aigus) ---
  // Plus dense que wav6a pour s'articuler avec le zoom fort
  const flowLow = noise(
    () => 1.0 + (L() + M1()) * 3.5,
    () => (0.02 + L() * 0.40) * _warmGate,
  )
  const flowHigh = noise(
    () => 2.8 + (M2() + Hh()) * 5.0,
    () => (0.07 + Hh() * 0.60) * _warmGate,
  )

  const flowAmtLow  = () => (0.014 + L() * 0.025 + M1() * 0.014) * _warmGate
  const flowAmtHigh = () => (0.008 + Hsoft() * 0.036 + M2() * 0.020) * _warmGate

  // --- Feedback fort ---
  const fbAmt = () => Math.min(0.42, (L() + M1() + M2() + Hsoft()) * 0.18 + 0.06) * _warmGate

  // --- Rotation réactive (différencie de wav6a qui n'utilise que scrollX/Y) ---
  // Les mids poussent la rotation, les graves la freinent
  const rotAmt = () => (M1() - L() * 0.5) * 0.006 + Math.sin(time * 0.11) * 0.003

  // --- Scroll différentiel légèrement plus ample ---
  const scrollXAmt = () => (M2() - L()) * 0.003 + Math.sin(time * 0.08) * 0.001
  const scrollYAmt = () => (M1() - Hh()) * 0.003

  // --- Zoom fort réactif — 3.5 base (wav6a = 2), monte avec les basses ---
  const zoomAmt = () => 3.5 + L() * 1.5 + M1() * 0.8 + Hsoft() * 0.5

  lowL
    .add(m1L,  () => Math.min(1, M1() * 5.0))
    .add(m2L,  () => Math.min(1, M2() * 5.0))
    .add(hiL,  () => Math.min(1, Hsoft() * 5.0))
    .saturate(2.0)
    .contrast(1.6)
    .modulate(flowLow,  flowAmtLow)
    .modulate(flowHigh, flowAmtHigh)
    .rotate(rotAmt)
    .scrollX(scrollXAmt)
    .scrollY(scrollYAmt)
    .blend(
      src(o0)
        .colorama(() => 0.008 + Hh() * 0.030 + L() * 0.020)
        .scale(() => 1.004 + Hsoft() * 0.010)  // zoom dans la boucle feedback → effet spirale
        .rotate(() => -rotAmt() * 0.6)          // contre-rotation douce dans le feedback
        .contrast(1.002),
      fbAmt,
    )
    .luma(0.10, 0.08)
    .brightness(-0.05)
    .scale(zoomAmt)
    .color(() => _tc[0], () => _tc[1], () => _tc[2])
    .out(o0)

  render(o0)

  return {
    setBands,
    setColors: (t: TimeColorTint) => { _tc = t },
    stop: () => { if (warmId !== null) cancelAnimationFrame(warmId) },
  }
}
