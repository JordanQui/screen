import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createRoseaceRondePatch = (api: HydraApi): HydraPatchController => {
  const { osc, src, render, o0, s0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L  = () => bands.low
  const M1 = () => bands.mid1
  const M2 = () => bands.mid2
  const Hh = () => bands.high

  // ── Énergie & temps audio ─────────────────────────────────────────────────
  const NOISE_FLOOR = 0.02, SILENCE_GATE = 0.05
  let eSmooth = 0
  let tAudio  = 0
  let lastMs  = performance.now()

  const updateEnergy = () => {
    const now = performance.now()
    const dt  = (now - lastMs) * 0.001
    lastMs    = now
    const hsRaw = Math.pow(Math.max(0, Hh()), 0.8)
    const raw   = Math.max(L(), M1(), M2(), hsRaw)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    eSmooth    += (Math.min(1, above) - eSmooth) * (above > eSmooth ? 0.35 : 0.05)
    tAudio     += eSmooth * dt
    frameId = requestAnimationFrame(updateEnergy)
  }
  frameId = requestAnimationFrame(updateEnergy)

  const E    = () => eSmooth
  const FB_G = () => Math.pow(Math.max(0, eSmooth - SILENCE_GATE) / (1 - SILENCE_GATE), 1.1)
  const Hs   = () => Math.pow(Math.max(0, Hh()), 0.8)
  const T    = () => tAudio

  const PHI = 1.6180339887

  // ── Source : logo SVG blanc sur noir ─────────────────────────────────────
  s0.initImage('/logorondewob.svg')

  // ── Champs de déformation (warp) — sync=0, phase=T() → gel au silence ────
  // Basses : peu de cycles → grandes ondulations du cercle
  const warpL = osc(
    () => 2 + L() * 10,
    0,
    () => T() * 1.2,
  )

  // Médiums : fréquence intermédiaire
  const warpM = osc(
    () => 5 + (M1() + M2()) * 20,
    0,
    () => T() * 2.2 + L() * Math.PI,
  ).rotate(() => T() * 0.22)

  // Aigus : haute fréquence → spiking fin sur les bords de la forme
  const warpH = osc(
    () => 12 + Hs() * 65,
    0,
    () => T() * 5.5 + M2() * Math.PI * PHI,
  ).rotate(() => T() * 0.58)

  // ── Logo déformé par les warps audio ─────────────────────────────────────
  const logo = src(s0)
    .saturate(0)
    .scale(() => 1.4 + E() * 0.15)               // zoomé dans le logo
    .scrollX(() => (L() - M2()) * 0.12)           // X : différence basses/mid2
    .scrollY(() => (M1() - Hs()) * 0.10)          // Y : différence mid1/aigus
    .modulate(warpL, () => 0.04 + L() * 0.18)
    .modulate(warpM, () => 0.02 + M1() * 0.10)
    .modulate(warpH, () => 0.005 + Hs() * 0.07)
    .contrast(() => 2.5 + L() * 2.0 + Hs() * 4.0)
    .brightness(() => -0.12 + L() * 0.22)

  // ── Feedback fractal ──────────────────────────────────────────────────────
  const fb = src(o0)
    .scale(() => 1.0 - L() * 0.025)
    .rotate(() => (M1() - L()) * 0.018 * FB_G())
    .modulate(warpL, () => (0.004 + L()  * 0.012) * FB_G())
    .modulate(warpH, () => (0.002 + Hs() * 0.016) * FB_G())
    .saturate(0)
    .contrast(1.003)
    .brightness(-0.011)

  // ── Rosace à 7 branches ───────────────────────────────────────────────────
  logo
    .add(fb, () => 0.22 + L() * 0.18 * FB_G())
    .luma(() => 0.08 + Hs() * 0.10)
    .contrast(() => 1.05 + L() * 0.25 + Hs() * 0.45)
    .kaleid(7)
    .scale(0.3)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
