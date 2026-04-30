import {
  midiToFreq,
  midiToNoteInfo,
  noteToHue,
  noteToColor,
  harmonicSalience,
  blendHues,
  blendColors,
  analyzeVibrato,
} from '~/utils/audio/pitchUtils'
import type { DetectedNote, PitchAnalysisResult } from '~/utils/audio/types'

// Grande FFT pour résolution fréquentielle fine (~5.86 Hz/bin à 48kHz)
const FFT_SIZE = 8192
const NUM_HARMONICS = 8

// Plage MIDI analysée : A1 (55Hz) → B6 (1975Hz)
const MIDI_MIN = 33
const MIDI_MAX = 95
// Résolution quart de demi-ton pour interpolation sub-bin
const MIDI_STEP = 0.25

const MAX_VOICES = 4
// Un pic doit atteindre au moins 20% du maximum de saillance
const MIN_SALIENCE_RATIO = 0.20
// Suppression des doublons dans un rayon de 1.5 demi-tons
const NMS_RADIUS_MIDI = 1.5
// Fenêtre d'historique de pitch pour analyse du vibrato (~0.5s à 60fps)
const PITCH_HISTORY_FRAMES = 32
// Tolérance de suivi des voix entre frames
const VOICE_MATCH_RADIUS_MIDI = 2.0

const MIC_GAIN = 3.0
const NOISE_DB = -90
// Double enveloppe pour détection de transitoires : rapide (attaque) vs lente (fond)
const ENV_FAST = 0.5
const ENV_SLOW = 0.02
const TREMOLO_HISTORY = 32
const FFT_SMOOTHING = 0.72  // lissage élevé pour stabiliser les couleurs sur boucles/notes tenues

interface VoiceTrack {
  midi: number
  pitchHistory: number[]
}

export function usePitchAnalysis() {
  const result = reactive<PitchAnalysisResult>({
    notes: [],
    dominant: null,
    transientSharpness: 0,
    tremoloDepth: 0,
    blendedHue: 0,
    blendedColor: [0, 0, 0],
    mood: { energy: 0, tension: 0, warmth: 0, brightness: 0, complexity: 0 },
  })

  let ctx: AudioContext | null = null
  let streamRef: MediaStream | null = null
  let specAnalyser: AnalyserNode | null = null
  let envAnalyser: AnalyserNode | null = null
  // Typés explicitement pour correspondre aux attentes de la Web Audio API (TS 5.x)
  let freqBuf: Float32Array<ArrayBuffer> | null = null
  let timeBuf: Float32Array<ArrayBuffer> | null = null
  let linearMags: Float32Array<ArrayBuffer> | null = null
  let tickId: number | null = null

  let voices: VoiceTrack[] = []
  let fastEnv = 0
  let slowEnv = 0
  let energyHistory: number[] = []

  // Pré-calcul des candidats MIDI et de leur fréquence fondamentale
  const midiCandidates: number[] = []
  for (let m = MIDI_MIN; m <= MIDI_MAX; m += MIDI_STEP) midiCandidates.push(m)
  const freqCandidates: number[] = midiCandidates.map(midiToFreq)
  const salienceArr = new Float32Array(midiCandidates.length)

  function dbToLinear(db: number): number {
    return db <= NOISE_DB ? 0 : Math.pow(10, db / 20)
  }

  function computeRms(buf: Float32Array<ArrayBuffer>): number {
    let s = 0
    for (let i = 0; i < buf.length; i++) s += (buf[i] ?? 0) ** 2
    return Math.sqrt(s / buf.length)
  }

  function computeSaliences(binWidth: number) {
    for (let i = 0; i < freqCandidates.length; i++) {
      salienceArr[i] = harmonicSalience(linearMags!, freqCandidates[i]!, binWidth, NUM_HARMONICS)
    }
  }

  // Recherche de pics locaux dans la courbe de saillance + NMS inter-voix
  function findPeakIndices(maxSalience: number): number[] {
    const peaks: number[] = []
    for (let i = 1; i < salienceArr.length - 1; i++) {
      const s = salienceArr[i] ?? 0
      if (
        s > (salienceArr[i - 1] ?? 0) &&
        s > (salienceArr[i + 1] ?? 0) &&
        s >= maxSalience * MIN_SALIENCE_RATIO
      ) {
        peaks.push(i)
      }
    }
    peaks.sort((a, b) => (salienceArr[b] ?? 0) - (salienceArr[a] ?? 0))

    const selected: number[] = []
    for (const idx of peaks) {
      if (selected.length >= MAX_VOICES) break
      const midi = midiCandidates[idx] ?? 0
      const tooClose = selected.some(s => Math.abs((midiCandidates[s] ?? 0) - midi) < NMS_RADIUS_MIDI)
      if (!tooClose) selected.push(idx)
    }
    return selected
  }

  // Association des fondamentaux courants aux voix de la frame précédente (nearest-neighbor)
  function updateVoices(currentMidis: number[]): VoiceTrack[] {
    const updated: VoiceTrack[] = []
    const used = new Set<number>()

    for (const midi of currentMidis) {
      let bestIdx = -1
      let bestDist = VOICE_MATCH_RADIUS_MIDI + 1
      for (let i = 0; i < voices.length; i++) {
        if (used.has(i)) continue
        const dist = Math.abs((voices[i]?.midi ?? 0) - midi)
        if (dist < bestDist) { bestDist = dist; bestIdx = i }
      }

      const existing = bestIdx >= 0 ? voices[bestIdx] : undefined
      if (existing) {
        existing.midi = midi
        existing.pitchHistory.push(midiToFreq(midi))
        if (existing.pitchHistory.length > PITCH_HISTORY_FRAMES) existing.pitchHistory.shift()
        used.add(bestIdx)
        updated.push(existing)
      } else {
        updated.push({ midi, pitchHistory: [midiToFreq(midi)] })
      }
    }
    return updated
  }

  function tick() {
    if (!specAnalyser || !envAnalyser || !freqBuf || !timeBuf || !linearMags || !ctx) {
      tickId = requestAnimationFrame(tick)
      return
    }

    // Spectre → magnitudes linéaires
    specAnalyser.getFloatFrequencyData(freqBuf)
    for (let i = 0; i < freqBuf.length; i++) linearMags[i] = dbToLinear(freqBuf[i] ?? NOISE_DB)

    // Signal temporel (non-lissé) pour transitoires et tremolo
    envAnalyser.getFloatTimeDomainData(timeBuf)
    const rms = computeRms(timeBuf) * MIC_GAIN

    // Double enveloppe : rapide (détecte les attaques) vs lente (niveau de fond)
    fastEnv += (rms - fastEnv) * ENV_FAST
    slowEnv += (rms - slowEnv) * ENV_SLOW
    const transientSharpness = slowEnv > 0.001
      ? Math.min(Math.max((fastEnv - slowEnv) / slowEnv, 0), 1)
      : 0

    // Tremolo : variance de l'énergie sur fenêtre glissante
    energyHistory.push(rms)
    if (energyHistory.length > TREMOLO_HISTORY) energyHistory.shift()
    const eMean = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length
    const tremoloDepth = energyHistory.length > 4
      ? Math.min(
          Math.sqrt(energyHistory.reduce((a, b) => a + (b - eMean) ** 2, 0) / energyHistory.length)
          / Math.max(eMean, 0.001),
          1
        )
      : 0

    // Saillance harmonique pour chaque candidat MIDI
    const binWidth = ctx.sampleRate / specAnalyser.fftSize
    computeSaliences(binWidth)

    let maxSalience = 0
    for (let i = 0; i < salienceArr.length; i++) {
      if ((salienceArr[i] ?? 0) > maxSalience) maxSalience = salienceArr[i] ?? 0
    }

    let detectedNotes: DetectedNote[] = []

    if (maxSalience > 0.002) {
      const peakIndices = findPeakIndices(maxSalience)
      voices = updateVoices(peakIndices.map(i => midiCandidates[i] ?? 0))

      detectedNotes = peakIndices.map((peakIdx, voiceIdx) => {
        const midi = midiCandidates[peakIdx] ?? MIDI_MIN
        const { noteIndex, noteName, octave } = midiToNoteInfo(midi)
        const voice = voices[voiceIdx] ?? { midi, pitchHistory: [midiToFreq(midi)] }
        const { depth: vibratoDepth, rate: vibratoRate } = analyzeVibrato(voice.pitchHistory)
        return {
          freq: midiToFreq(midi),
          midi,
          noteIndex,
          noteName,
          octave,
          salience: (salienceArr[peakIdx] ?? 0) / maxSalience,
          hue: noteToHue(noteIndex),
          color: noteToColor(noteIndex, octave),
          vibratoDepth,
          vibratoRate,
        } satisfies DetectedNote
      })
    } else {
      voices = []
    }

    detectedNotes.sort((a, b) => b.salience - a.salience)
    const dominant = detectedNotes[0] ?? null

    // Couleur et teinte mélangées (mélange circulaire pondéré par saillance)
    let blendedHue = 0
    let blendedColor: [number, number, number] = [0, 0, 0]
    if (detectedNotes.length > 0) {
      const w = detectedNotes.map(n => n.salience)
      blendedHue = blendHues(detectedNotes.map(n => n.hue), w)
      blendedColor = blendColors(detectedNotes.map(n => n.color), w)
    }

    // Moyennes pondérées pour le calcul du mood
    const totalSalience = detectedNotes.reduce((a, n) => a + n.salience, 0)
    const avgOctave = totalSalience > 0
      ? detectedNotes.reduce((a, n) => a + n.octave * n.salience, 0) / totalSalience
      : 0
    const avgVibrato = totalSalience > 0
      ? detectedNotes.reduce((a, n) => a + n.vibratoDepth * n.salience, 0) / totalSalience
      : 0
    const complexity = detectedNotes.length / MAX_VOICES

    result.notes = detectedNotes
    result.dominant = dominant
    result.transientSharpness = transientSharpness
    result.tremoloDepth = tremoloDepth
    result.blendedHue = blendedHue
    result.blendedColor = blendedColor
    result.mood = {
      energy: Math.min(rms * 4, 1),
      tension: Math.min(avgVibrato * 0.4 + (avgOctave / 7) * 0.35 + complexity * 0.25, 1),
      warmth: Math.min((1 - transientSharpness) * 0.55 + (1 - avgOctave / 7) * 0.45, 1),
      brightness: Math.min((avgOctave / 7) * 0.55 + transientSharpness * 0.25 + (1 - avgVibrato) * 0.2, 1),
      complexity,
    }

    tickId = requestAnimationFrame(tick)
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
          sampleRate: { ideal: 48000 },
        },
        video: false,
      })
      streamRef = stream

      const track = stream.getAudioTracks()[0]
      if (track?.applyConstraints) {
        try {
          await track.applyConstraints({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          })
        } catch {}
      }

      ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
      const src = ctx.createMediaStreamSource(stream)
      const gain = ctx.createGain()
      gain.gain.value = MIC_GAIN
      src.connect(gain)

      // Grand analyseur spectral (FFT 8192) pour la détection de fondamentales multiples
      specAnalyser = ctx.createAnalyser()
      specAnalyser.fftSize = FFT_SIZE
      specAnalyser.smoothingTimeConstant = FFT_SMOOTHING
      gain.connect(specAnalyser)

      // Analyseur temporel non-lissé pour la détection de transitoires
      envAnalyser = ctx.createAnalyser()
      envAnalyser.fftSize = 2048
      envAnalyser.smoothingTimeConstant = 0
      gain.connect(envAnalyser)

      // Sortie silencieuse obligatoire (évite de restituer le signal mic dans les haut-parleurs)
      const silence = ctx.createGain()
      silence.gain.value = 0
      specAnalyser.connect(silence)
      envAnalyser.connect(silence)
      silence.connect(ctx.destination)

      freqBuf = new Float32Array(specAnalyser.frequencyBinCount)
      timeBuf = new Float32Array(envAnalyser.fftSize)
      linearMags = new Float32Array(specAnalyser.frequencyBinCount)

      tickId = requestAnimationFrame(tick)
    } catch {}
  }

  function stop() {
    if (tickId !== null) cancelAnimationFrame(tickId)
    tickId = null
    try { specAnalyser?.disconnect() } catch {}
    try { envAnalyser?.disconnect() } catch {}
    if (ctx?.state !== 'closed') ctx?.close().catch(() => {})
    streamRef?.getTracks().forEach(t => t.stop())
    ctx = null; streamRef = null; specAnalyser = null; envAnalyser = null
    freqBuf = null; timeBuf = null; linearMags = null
    voices = []; fastEnv = 0; slowEnv = 0; energyHistory = []
  }

  return { result, start, stop }
}
