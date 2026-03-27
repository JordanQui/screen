declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav1Patch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L = () => bands.low
  const M1 = () => bands.mid1
  const M2 = () => bands.mid2
  const Hh = () => bands.high

  const Hsoft = () => Math.pow(Hh(), 0.72)

  const fLow = () => 8 + L() * 22 + (L() * 3.0) * (Math.sin(time * 0.90) + Math.sin(time * 1.457)) * 0.5
  const fM1 = () => 11 + M1() * 8 + (M1() * 2.4) * (Math.sin(time * 1.00) + Math.sin(time * 1.618)) * 0.5
  const fM2 = () => 15 + M2() * 10 + (M2() * 2.8) * (Math.sin(time * 1.20) + Math.sin(time * 1.946)) * 0.5
  const fHigh = () => Math.min(18 + Hsoft() * 28 + (Hsoft() * 3.2) * (Math.sin(time * 1.9) + Math.sin(time * 2.89)) * 0.5, 34)

  const red = osc(fLow, 0, 0).color(() => 0.12 + L() * 0.88, 0, 0)
  const green = osc(fM1, 0, 0).color(0, () => 0.18 + M1() * 0.82, 0)
  const blue = osc(fM2, 0, 0).color(0, 0, () => 0.18 + M2() * 0.82)

  const white = osc(fHigh, 0, 0)
    .modulate(
      noise(() => 1.2 + Hsoft() * 7.0, () => 0.12 + Hsoft() * 0.45),
      () => 0.012 + Hsoft() * 0.050,
    )
    .color(
      () => 0.12 + Math.min(1.00, Hsoft() * 1.10),
      () => 0.12 + Math.min(1.00, Hsoft() * 1.10),
      () => 0.12 + Math.min(1.00, Hsoft() * 1.10),
    )

  let mix = red.add(green, 0.95).add(blue, 0.95).add(white, 0.95)
    .saturate(1.02).contrast(1.01)

  const flow = noise(
    () => 1.3 + (M1() + M2() + Hh()) * 2.4,
    () => 0.06 + Hh() * 0.45,
  )
  mix = mix.modulate(flow, () => 0.012 + (L() + M1() + M2()) * 0.018 + Hsoft() * 0.030)
    .scrollX(() => (M2() - L()) * 0.003)
    .scrollY(() => (M1() - Hh()) * 0.003)

  const fbAmt = () => Math.min(0.45, 0.12 + (L() + M1() + M2()) * 0.20 + Hsoft() * 0.18)
  mix.blend(
    src(o0).colorama(() => 0.010 + Hh() * 0.040).contrast(1.001).colorama(0.1, 0.1, 0.1).luma(0.25, 1),
    fbAmt,
  ).out(o0)

  render(o0)

  return { setBands, stop: () => {} }
}
