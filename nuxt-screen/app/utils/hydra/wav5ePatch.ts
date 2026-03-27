declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav5ePatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L = () => bands.low, M1 = () => bands.mid1, M2 = () => bands.mid2, Hh = () => bands.high

  const H_GAIN = 1.8, H_GAMMA = 0.60
  const Hsens = () => Math.min(1, Math.pow(Math.max(0, Hh()), H_GAMMA) * H_GAIN)

  const NOISE_FLOOR = 0.02, SILENCE_GATE = 0.06, ATTACK_COEF = 0.30, RELEASE_COEF = 0.06
  let eSmooth = 0

  const updateEnergy = () => {
    const henergy = Hsens()
    const raw = Math.max(L(), M1(), M2(), henergy)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = Math.min(1, above)
    const coef = target > eSmooth ? ATTACK_COEF : RELEASE_COEF
    eSmooth += (target - eSmooth) * coef
    frameId = requestAnimationFrame(updateEnergy)
  }
  frameId = requestAnimationFrame(updateEnergy)

  const FB_G = () => { const x = Math.max(0, eSmooth - SILENCE_GATE) / (1 - SILENCE_GATE); return Math.pow(x, 1.2) }
  const E = () => eSmooth

  const fLow = () => 6 + L() * 8 + Hsens() * 2.5 + (L() * 1.2) * (Math.sin(time * 0.9) + Math.sin(time * 1.31)) * 0.5
  const fM1 = () => 9 + M1() * 6 + Hsens() * 4.0 + (M1() * 1.0) * (Math.sin(time * 1.1) + Math.sin(time * 1.77)) * 0.5
  const fM2 = () => 12 + M2() * 8 + Hsens() * 7.5 + (M2() * 1.2) * (Math.sin(time * 1.3) + Math.sin(time * 2.03)) * 0.5

  const base = osc(() => fLow() + Hsens() * 2, 0, () => (L() + M1() + M2()) * 0.2 + Hsens() * 24)
    .add(osc(fM1, 0, 1), 0.6)
    .add(osc(fM2, 0, 1), 0.6)
    .contrast(() => 1.03 + Hsens() * 2)
    .brightness(-0.5)

  const coarseNoise = noise(() => 0.5 + (L() + M1()) * 1.8, () => 0.08 + M2() * 0.25)
  const fineNoise = noise(() => 0.24 + Hsens() * 4, () => 0.6 + Hsens() * 0.60)

  const field = coarseNoise.add(fineNoise, () => 0.55 + Hsens() * 0.45)
    .contrast(() => 1.0 + E() * 0.10 + Hsens() * 0.06)

  const fb = src(o0)
    .modulate(field, () => (0.006 + E() * 0.015 + Hsens() * 0.012) * FB_G())
    .colorama(() => 0.24 * FB_G() * 5)
    .contrast(() => 1.003 + Hsens() * 0.003)

  base
    .modulate(field, () => (0.005 + (L() + M1() + M2()) * 0.01 + Hsens() * 0.035) * FB_G())
    .add(fineNoise, () => (0.02 + Hsens() * 0.22) * FB_G())
    .contrast(() => 1.01 + E() * 0.06 + Hsens() * 0.04)
    .brightness(() => -0.06 - E() * 0.04 - Hsens() * 0.015)
    .add(fb, () => Math.min(0.38, (0.06 + (L() + M1()) * 0.14 + Hsens() * 0.18) * FB_G()))
    .brightness(-0.25)
    .luma(() => 0.75 + (E() - 0.5) * 0.10 + Hsens() * -0.4)
    .blend(o0)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
