declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createCircles1Patch = (api: HydraApi): HydraPatchController => {
  const { noise, shape, render, o0 } = api

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

  const t = 0.5
  const e = () => specAt(t)
  const fNoise = () => 0.6 + 14.4 * e()
  const sNoise = () => 0.02 + 0.98 * e()
  const R = 0.38
  const thick = () => 0.04 + 0.06 * $resonance()
  const inner = () => Math.max(0.01, R - thick())
  const smooth = () => 0.01 + 0.02 * $resonance()

  const cr = () => 1 - 5 * (2 * $L() + 0.2)
  const cg = () => 1 - 1.5 * ($M1() + 0.2)
  const cb = () => 1 - 0.5 * ($M2() + 0.2 * t)

  shape(96, R, smooth)
    .diff(shape(500, inner, smooth))
    .rotate(() => time * 0.05 * $breath())
    .modulate(noise(fNoise, sNoise), () => 0.02 + 0.10 * $resonance())
    .modulateScale(noise(() => fNoise() * 0.8, () => sNoise() * 0.4), () => 0.01 + 0.05 * $breath())
    .brightness(() => 0.8 + bands.low * 0.3)
    .luma(0.1, 1).luma(0.1, 1).luma(0.1, 1)
    .color(cr, cg, cb)
    .scale(() => 1.2 + 0.1 * $breath())
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
