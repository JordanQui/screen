export interface DetectedNote {
  freq: number
  midi: number
  noteIndex: number   // 0-11, C=0
  noteName: string    // ex: "A#3"
  octave: number
  salience: number    // 0-1, relatif au fondamental dominant
  hue: number         // 0-360
  color: [number, number, number]  // RGB normalisé 0-1
  vibratoDepth: number  // 0-1
  vibratoRate: number   // Hz
}

export interface PitchMood {
  energy: number      // 0-1 : énergie globale (volume × attaque)
  tension: number     // 0-1 : vibrato + registre aigu + complexité
  warmth: number      // 0-1 : soutenu + registre médium-grave
  brightness: number  // 0-1 : aigus + attaque franche
  complexity: number  // 0-1 : nombre de voix simultanées / MAX_VOICES
}

export interface PitchAnalysisResult {
  notes: DetectedNote[]
  dominant: DetectedNote | null
  transientSharpness: number   // 0-1
  tremoloDepth: number         // 0-1
  blendedHue: number           // 0-360, mélange pondéré des notes détectées
  blendedColor: [number, number, number]
  mood: PitchMood
}
