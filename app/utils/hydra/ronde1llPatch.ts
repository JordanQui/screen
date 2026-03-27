declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createRonde1llPatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L = () => bands.low, M1 = () => bands.mid1, M2 = () => bands.mid2, Hh = () => bands.high
  const NOISE_FLOOR = 0.08, SILENCE_GATE = 0.06, ATTACK_COEF = 0.30, RELEASE_COEF = 0.06
  let eSmooth = 0

  const updateEnergy = () => {
    const hsoft = Math.pow(Math.max(0, Hh()), 0.75)
    const raw = Math.max(L(), M1(), M2(), hsoft)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = Math.min(1, above)
    eSmooth += (target - eSmooth) * (target > eSmooth ? ATTACK_COEF : RELEASE_COEF)
    frameId = requestAnimationFrame(updateEnergy)
  }
  frameId = requestAnimationFrame(updateEnergy)

  const FB_G = () => { const x = Math.max(0, eSmooth - SILENCE_GATE) / (1 - SILENCE_GATE); return Math.pow(x, 1.2) }
  const E = () => eSmooth
  const Hsoft = () => Math.pow(Math.max(0, Hh()), 0.75)

  const fLow = () => 6 + L() * 8 + (L() * 1.2) * (Math.sin(time * 0.9) + Math.sin(time * 1.31)) * 0.5
  const fM1 = () => 9 + M1() * 6 + (M1() * 1.0) * (Math.sin(time * 1.1) + Math.sin(time * 1.77)) * 0.5
  const fM2 = () => 12 + M2() * 8 + (M2() * 1.2) * (Math.sin(time * 1.3) + Math.sin(time * 2.03)) * 0.5

  const base = osc(fLow, 0, () => (L() + M1() + M2()) * 0.2 - Hsoft() * 12.5)
    .add(osc(fM1, 0, 1), 0.6).add(osc(fM2, 0, 1), 0.6)
    .contrast(1.02).brightness(-0.03)

  const coarseNoise = noise(() => 0.8 + (L() + M1()) * 1.8, () => 0.08 + M2() * 0.25)
  const fineNoise = noise(() => 0.2 + Hsoft() * 6.0, () => 0.6 + Hsoft() * 0.50)
  const field = coarseNoise.add(fineNoise, () => 0.55 + Hsoft() * 0.35)
    .scrollX(() => (M2() - L()) * 0.002 * FB_G())
    .scrollY(() => (M1() - Hh()) * 0.002 * FB_G())
    .contrast(() => 1.0 + E() * 0.08)

  const fb = src(o0).modulate(field, () => (0.006 + E() * 0.015) * FB_G())
    .colorama(() => 0.004 * FB_G()).contrast(1.002).brightness(-0.01)

  const fbAmt1 = () => Math.min(0.42, (0.10 + (L() + M1() + M2()) * 0.18 + Hsoft() * 0.16) * FB_G())
  const fbAmt2 = () => Math.min(0.35, (0.06 + (L() + M1()) * 0.14 + Hsoft() * 0.12) * FB_G())

  base
    .modulate(field, () => (0.005 + (L() + M1() + M2()) * 0.01 + Hsoft() * 0.02) * FB_G() * 0.2)
    .add(fineNoise, () => (0.02 + Hsoft() * 0.15) * FB_G())
    .contrast(() => 1.01 + E() * 0.05)
    .brightness(() => -0.06 + E() * 0.04)
    .diff(fb, fbAmt1)
    .add(fb, fbAmt2)
    .scale(() => 1 - (L() + M1() + M2()) * 0.01 + Hsoft() * 0.9)
    .scrollX(-0.4)
    .luma(() => -10.5 + (E() + 0.2) * 0.10)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
