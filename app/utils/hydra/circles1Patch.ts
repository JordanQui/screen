declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createCircles1Patch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, solid, shape, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  let lastBandT = performance.now()
  let breath = 0, resonance = 0
  let colorWarm = 0, colorGreen = 0, colorBlue = 0, shimmer = 0

  const updateEnvelopes = () => {
    const stale = (performance.now() - lastBandT) > 250
    const l = stale ? 0 : bands.low
    const m1 = stale ? 0 : bands.mid1
    const m2 = stale ? 0 : bands.mid2
    const h = stale ? 0 : bands.high

    const targetBreath = Math.max(l, m1, m2, h)
    breath += (targetBreath - breath) * (targetBreath > breath ? 0.50 : 0.15)
    resonance += (targetBreath - resonance) * (targetBreath > resonance ? 0.10 : 0.035)

    colorWarm += (l - colorWarm) * 0.05
    colorGreen += (m1 - colorGreen) * 0.40
    colorBlue += (m2 - colorBlue) * 0.40
    shimmer += (h - shimmer * 2)

    lastBandT = performance.now()
    frameId = requestAnimationFrame(updateEnvelopes)
  }

  const $breath = () => breath
  const $resonance = () => resonance
  const $L = () => colorWarm
  const $M1 = () => colorGreen
  const $M2 = () => colorBlue
  const $H = () => shimmer

  function bell(x: number, c: number, w: number): number {
    const k = (x - c) / w
    return Math.exp(-0.5 * k * k)
  }
  function specAt(x: number): number {
    const bL = bell(x, 0.10, 0.22), b1 = bell(x, 0.35, 0.20)
    const b2 = bell(x, 0.65, 0.20), bH = bell(x, 0.90, 0.22)
    const num = bL * $L() + b1 * $M1() + b2 * $M2() + bH * $H()
    const den = bL + b1 + b2 + bH + 1e-6
    return num / den
  }

  function ringsMulti(n: number = 9) {
    const fMin = 0.6, fMax = 15.0
    const spdMin = 0.02, spdMax = 1
    const baseR = 0.1, endR = 0.5
    const thick = () => 0.010 + 0.025 * $resonance()

    let op = solid(0, 0, 0, 0)

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      const e = () => specAt(t)
      const fNoise = () => fMin + (fMax - fMin) * e()
      const sNoise = () => spdMin + (spdMax - spdMin) * e()
      const rot = () => (0.01 + 0.10 * $breath()) * (t - 0.5)
      const R = () => baseR + (endR - baseR) * t
      const inner = () => Math.max(0.01, R() - thick())
      const smooth = () => 0.02 + 0.03 * $resonance()

      const cr = () => 1 - 5 * (2 * $L() + 0.4 * (1 - t))
      const cg = () => 1 - 1.5 * (1 * $M1() + 0.4 * (0.5 + 0.5 * Math.cos(3.1415 * t)))
      const cb = () => 1 - 0.50 * (0.4 * $M2() + 0.4 * t)

      const ringTex = shape(96, R, smooth)
        .diff(shape(500, inner, smooth))
        .rotate(() => time * rot())
        .modulate(noise(fNoise, sNoise), () => 0.015 + 0.090 * $resonance())
        .modulateScale(noise(() => 0.8 + 0.6 * fNoise(), () => 0.4 * sNoise()), () => 0.01 + 0.06 * $breath())
        .brightness(() => 0.75 + bands.low * 0.3)
        .scale(() => 6 + bands.low * 6)
        .luma(0.2, 1).luma(0.2, 1).luma(0.2, 1).luma(0.2, 1).luma(0.2, 1)
        .color(cr, cg, cb)

      op = op.add(ringTex, () => 0.08 + 0.18 * e())
    }
    return op
  }

  ringsMulti(8)
    .scale(() => 0.5 + 0.05 * $breath())
    .luma(() => 0.08 + 0.10 * $H())
    .saturate(() => 1.0 + 0.4 * $resonance())
    .out(o0)

  render(o0)

  frameId = requestAnimationFrame(updateEnvelopes)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
