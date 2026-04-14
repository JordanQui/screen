declare const time: number
import type { HydraApi, HydraBandValues, HydraPatchController } from './types'

export const createRoseaceRondePatch = (api: HydraApi): HydraPatchController => {
  const { osc, noise, src, render, o0 } = api

  let bands: HydraBandValues = { low: 0, mid1: 0, mid2: 0, high: 0 }
  let frameId: number | null = null
  const setBands = (b: HydraBandValues) => { bands = { ...b } }

  const L  = () => bands.low
  const M1 = () => bands.mid1
  const M2 = () => bands.mid2
  const Hh = () => bands.high

  // ── Enveloppe d'énergie globale ───────────────────────────────────────────
  const NOISE_FLOOR = 0.02, SILENCE_GATE = 0.05
  let eSmooth = 0

  const updateEnergy = () => {
    const hsRaw = Math.pow(Math.max(0, Hh()), 0.8)
    const raw   = Math.max(L(), M1(), M2(), hsRaw)
    const above = Math.max(0, raw - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    eSmooth    += (Math.min(1, above) - eSmooth) * (above > eSmooth ? 0.35 : 0.05)
    frameId     = requestAnimationFrame(updateEnergy)
  }
  frameId = requestAnimationFrame(updateEnergy)

  const E    = () => eSmooth
  const FB_G = () => Math.pow(Math.max(0, eSmooth - SILENCE_GATE) / (1 - SILENCE_GATE), 1.1)
  // hautes fréquences adoucies pour éviter la saturation
  const Hs   = () => Math.pow(Math.max(0, Hh()), 0.8)

  // ── Rapport doré dans les phases ─────────────────────────────────────────
  // φ dans les syncs crée des battements quasi-périodiques entre les oscs
  // sans modifier les fréquences (diff lisible garanti).
  const PHI = 1.6180339887

  // ── OSC 1 — LE SOUFFLE  (basses) ──────────────────────────────────────────
  const souffle = osc(
    () => 3  + L()  * 16,
    () => 0.02 + L()  * 0.15,
    () => L()  * Math.PI * 2,
  ).saturate(0)
    .contrast(() => 1.2 + L() * 2.2)
    .brightness(() => -0.06 + L() * 0.22)

  // ── OSC 2 — LE BATTEMENT  (médiums)  — sync × φ ──────────────────────────
  const battement = osc(
    () => 9  + (M1() + M2()) * 14,
    () => 0.08 + M1()  * 0.35,
    () => M2() * Math.PI * PHI + Math.sin(time * 0.4) * 0.3,
  ).saturate(0)
    .contrast(() => 1.1 + M1() * 1.8)
    .brightness(() => -0.05 + M1() * 0.2)

  // ── OSC 3 — LE FRÉMISSEMENT  (hautes)  — sync × φ² ───────────────────────
  const fremissement = osc(
    () => 22 + Hs() * 50,
    () => 0.25 + Hs() * 1.0,
    () => Hs() * Math.PI * PHI * PHI + Math.sin(time * 1.1) * 0.5,
  ).saturate(0)
    .contrast(() => 1.4 + Hs() * 3.0)
    .brightness(() => -0.1 + Hs() * 0.35)

  // ── Champ de dérive partagé ────────────────────────────────────────────────
  const derive = noise(
    () => 1.2 + (L()  + M1()) * 2.5,
    () => 0.07 + M2() * 0.2,
  )

  // ── Graine fractale — osc indépendant pré-plié en 3 ─────────────────────
  // Fréquence × φ par rapport au battement, kaleid(3) avant le kaleid(7) final.
  // Ce motif distord l'espace de la composition → auto-similarité multi-échelle.
  const graine = osc(
    () => (9 + (M1() + M2()) * 14) * PHI,
    () => 0.12 + E() * 0.25,
    () => time * 0.6 + L() * 2,
  ).kaleid(3)
    .scale(() => 0.45 + E() * 0.18)
    .rotate(() => time * 0.009 + (M2() - L()) * 0.15)

  // ── Composition — structure originale + graine comme modulateur ───────────
  const compose = souffle
    .modulate(derive, () => 0.008 + L()  * 0.022)
    .diff(battement.modulate(derive, () => 0.005 + M1() * 0.016))
    .add(fremissement, () => 0.08 + Hs() * 0.48)
    .modulate(graine, () => 0.015 + E() * 0.040)
    .saturate(0)
    .contrast(() => 1.06 + E() * 0.32)
    .brightness(() => -0.04)

  // ── Feedback — la mémoire tournante ───────────────────────────────────────
  const fb = src(o0)
    .scale(() => 1.0 - L() * 0.012)
    .rotate(() => (M1() - L()) * 0.025 + time * 0.004)
    .modulate(derive, () => (0.004 + E() * 0.01) * FB_G())
    .contrast(1.003)
    .brightness(-0.012)

  // ── Rosace à 7 branches ───────────────────────────────────────────────────
  compose
    .add(fb, () => 0.22 + (L() + M1()) * 0.12 * FB_G())
    .saturate(0)
    .luma(() => 0.15 + E() * 0.18)
    .contrast(() => 1.1 + E() * 0.28)
    .kaleid(7)
    .out(o0)

  render(o0)

  return {
    setBands,
    stop: () => { if (frameId !== null) cancelAnimationFrame(frameId) },
  }
}
