declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createWav2Patch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L = () => bands.low, M1 = () => bands.mid1, M2 = () => bands.mid2, Hh = () => bands.high
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

  const P = {
    color: { low: '#ff6b00', m1: '#00ffd0', m2: '#7a5cff', hi: '#ffd54a' },
    fm: { low: 1.0, m1: 1.0, m2: 1.0, hi: 1.0 },
    flow: { scale: 0.18, speed: 0.95, amt: 3.20 },
    nHi: { scale: 0.60, speed: 0.95, mix: 0.00 },
    view: { zoom: 0.92 },
    detail: { mul: 1.12 },
    perf: { quality: 2 },
    _col: { low: [1, 0, 0], m1: [0, 1, 0], m2: [0, 0, 1], hi: [1, 1, 1] } as Record<string, number[]>,
  }
  function hexToF3(hex: string): number[] {
    const h = (hex || '#000').replace('#', '').trim()
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255]
  }
  P._col.low = hexToF3(P.color.low); P._col.m1 = hexToF3(P.color.m1)
  P._col.m2 = hexToF3(P.color.m2); P._col.hi = hexToF3(P.color.hi)

  function fbmNoise(scaleFn: () => number, speedFn: () => number) {
    const n1 = noise(scaleFn, speedFn)
    if (P.perf.quality <= 1) return n1
    const n2 = noise(() => scaleFn() * 2.07, () => speedFn() * 1.31)
    if (P.perf.quality === 2) {
      const n3 = noise(() => scaleFn() * 4.19, () => speedFn() * 1.73)
      return n1.add(n2, 0.5).add(n3, 0.25)
    }
    return n1.add(n2, 0.5)
  }

  let _warmGate = 0
  let warmFrames = 0
  let warmId: number | null = null
  const warmStep = () => { warmFrames++; if (warmFrames >= 2) _warmGate = 1; else warmId = requestAnimationFrame(warmStep) }
  warmId = requestAnimationFrame(warmStep)

  const Hsoft = () => Math.pow(clamp01(Hh()), 0.72)
  const D = () => P.detail.mul

  const fLow = () => D() * (8 + (L() * 22 * P.fm.low) + (L() * 3.0 * P.fm.low) * (Math.sin(time * 0.90) + Math.sin(time * 1.457)) * 0.5)
  const fM1 = () => D() * (11 + (M1() * 8 * P.fm.m1) + (M1() * 2.4 * P.fm.m1) * (Math.sin(time * 1.00) + Math.sin(time * 1.618)) * 0.5)
  const fM2 = () => D() * (15 + (M2() * 10 * P.fm.m2) + (M2() * 2.8 * P.fm.m2) * (Math.sin(time * 1.20) + Math.sin(time * 1.946)) * 0.5)
  const fHigh = () => D() * Math.min(18 + (Hsoft() * 28 * P.fm.hi) + (Hsoft() * 3.2 * P.fm.hi) * (Math.sin(time * 1.9) + Math.sin(time * 2.89)) * 0.5, 34)

  const baseLow = () => 0.12 + L() * 0.88
  const baseM1 = () => 0.18 + M1() * 0.82
  const baseM2 = () => 0.18 + M2() * 0.82
  const baseHigh = () => 0.12 + Math.min(1.0, Hsoft() * 1.10)

  const lowL = osc(fLow, 0, 0).color(() => baseLow() * P._col.low[0], () => baseLow() * P._col.low[1], () => baseLow() * P._col.low[2])
  const m1L = osc(fM1, 0, 0).color(() => baseM1() * P._col.m1[0], () => baseM1() * P._col.m1[1], () => baseM1() * P._col.m1[2])
  const m2L = osc(fM2, 0, 0).color(() => baseM2() * P._col.m2[0], () => baseM2() * P._col.m2[1], () => baseM2() * P._col.m2[2])

  const fbm = fbmNoise(() => (1.2 + Hsoft() * 6.5) * P.nHi.scale, () => (0.11 + Hsoft() * 0.40) * P.nHi.speed)
  const hiL = osc(fHigh, 0, 0)
    .modulate(fbm, () => (0.010 + Hsoft() * 0.040) * P.nHi.mix)
    .color(() => baseHigh() * P._col.hi[0], () => baseHigh() * P._col.hi[1], () => baseHigh() * P._col.hi[2])

  let mix = lowL.add(m1L, 0.95).add(m2L, 0.95).add(hiL, 0.95)
    .saturate(1.01).contrast(1.005)
    .scale(() => P.view.zoom)

  const flow = noise(
    () => (1.25 + (M1() + M2() + Hh()) * 2.2) * P.flow.scale,
    () => (0.05 + Hh() * 0.40) * P.flow.speed * _warmGate,
  )
  const flowAmt = () => (0.010 + (L() + M1() + M2()) * 0.015 + Hsoft() * 0.026) * P.flow.amt * _warmGate

  mix = mix.modulate(flow, flowAmt)
    .scrollX(() => (M2() - L()) * 0.0022)
    .scrollY(() => (M1() - Hh()) * 0.0022)

  const fbAmtBase = () => Math.min(0.22, 0.10 + (L() + M1() + M2()) * 0.14 + Hsoft() * 0.10)
  const fbAmt = () => fbAmtBase() * _warmGate

  mix.blend(
    src(o0).colorama(() => 0.006 + Hh() * 0.020).contrast(1.0005),
    fbAmt,
  ).out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (warmId !== null) cancelAnimationFrame(warmId) },
  }
}
