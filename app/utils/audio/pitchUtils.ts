// Mapping chromatique : C=rouge, gravité vers sombre, aigu vers brillant
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
// 12 demi-tons répartis sur la roue des teintes (30° par demi-ton, C = 0° rouge)
const NOTE_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const

export function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / 440) + 69
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiToNoteInfo(midi: number): {
  noteIndex: number
  noteName: string
  octave: number
} {
  const rounded = Math.round(midi)
  const noteIndex = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  // noteIndex est toujours 0-11, les tableaux ont 12 éléments
  return { noteIndex, noteName: NOTE_NAMES[noteIndex]! + octave, octave }
}

export function noteToHue(noteIndex: number): number {
  return NOTE_HUES[noteIndex]!
}

// h: 0-360, s: 0-100, l: 0-100 → RGB 0-1
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0), f(8), f(4)]
}

// Octave grave → sombre (L=28%), aigu → brillant (L=72%)
export function noteToColor(noteIndex: number, octave: number): [number, number, number] {
  const hue = noteToHue(noteIndex)
  const clamped = Math.min(Math.max(octave, 1), 7)
  const lightness = 28 + (clamped - 1) * 7.3
  return hslToRgb(hue, 85, lightness)
}

// Saillance harmonique d'un candidat f0 dans le spectre de magnitudes linéaires.
// Somme les magnitudes aux harmoniques k*f0 avec pondération exponentielle (0.85^(k-1)).
// Utilise ArrayLike pour compatibilité Float32Array sans contrainte de buffer type.
export function harmonicSalience(
  magnitudes: ArrayLike<number>,
  f0: number,
  binWidth: number,
  numHarmonics: number
): number {
  let salience = 0
  const maxBin = magnitudes.length
  for (let k = 1; k <= numHarmonics; k++) {
    const freq = f0 * k
    const bin = freq / binWidth
    if (bin >= maxBin) break
    const b0 = Math.floor(bin)
    const frac = bin - b0
    const m0 = magnitudes[b0] ?? 0
    const m1 = b0 + 1 < maxBin ? (magnitudes[b0 + 1] ?? 0) : m0
    salience += (m0 * (1 - frac) + m1 * frac) * Math.pow(0.85, k - 1)
  }
  return salience
}

// Mélange circulaire de teintes pondérées (gère le repliement 0°/360°)
export function blendHues(hues: number[], weights: number[]): number {
  let sx = 0, sy = 0
  for (let i = 0; i < hues.length; i++) {
    const rad = ((hues[i] ?? 0) / 180) * Math.PI
    sx += (weights[i] ?? 0) * Math.cos(rad)
    sy += (weights[i] ?? 0) * Math.sin(rad)
  }
  return ((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360
}

export function blendColors(
  colors: [number, number, number][],
  weights: number[]
): [number, number, number] {
  let r = 0, g = 0, b = 0, total = 0
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i] ?? ([0, 0, 0] as [number, number, number])
    const w = weights[i] ?? 0
    r += c[0] * w; g += c[1] * w; b += c[2] * w
    total += w
  }
  if (total === 0) return [0, 0, 0]
  return [r / total, g / total, b / total]
}

// Détecte vibrato et tremolo dans un historique de pitch (Hz).
// Profondeur : déviation standard normalisée (3% écart = plein vibrato).
// Taux : estimé par comptage de passages par zéro (≈ 60fps).
export function analyzeVibrato(history: number[]): { depth: number; rate: number } {
  const n = history.length
  if (n < 8) return { depth: 0, rate: 0 }

  const mean = history.reduce((a, b) => a + b, 0) / n
  if (mean === 0) return { depth: 0, rate: 0 }

  const detrended = history.map(v => v - mean)
  const variance = detrended.reduce((a, b) => a + b * b, 0) / n
  const depth = Math.min(Math.sqrt(variance) / (mean * 0.03), 1)

  let crossings = 0
  for (let i = 1; i < n; i++) {
    if (((detrended[i - 1] ?? 0) < 0) !== ((detrended[i] ?? 0) < 0)) crossings++
  }
  const rate = (crossings / 2) / (n / 60)

  return { depth, rate: Math.min(rate, 15) }
}
