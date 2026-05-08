export type TimeColorTint = [number, number, number]

// 7 moments symboliques du jour — multiplicateurs RGB (1.0 = neutre)
interface Anchor { hour: number; tint: TimeColorTint; label: string }

export const TIME_ANCHORS: Anchor[] = [
  { hour: 0,  tint: [0.50, 0.60, 1.50], label: 'nuit' },        // bleu profond, cosmos
  { hour: 5,  tint: [1.50, 0.85, 0.80], label: 'aube' },        // rose doré, naissance
  { hour: 7,  tint: [1.35, 1.15, 0.45], label: 'matin' },       // jaune doré, éveil
  { hour: 12, tint: [1.00, 1.00, 0.95], label: 'midi' },        // neutre lumineux, apogée
  { hour: 14, tint: [1.25, 0.95, 0.55], label: 'ap.-midi' },    // ambre, chaleur
  { hour: 18, tint: [1.50, 0.55, 0.35], label: 'soir' },        // orange flamme, coucher de soleil
  { hour: 21, tint: [0.75, 0.50, 1.25], label: 'crépuscule' },  // pourpre, romantisme
  { hour: 23, tint: [0.50, 0.60, 1.50], label: 'nuit' },        // retour bleu nuit
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpTint(a: TimeColorTint, b: TimeColorTint, t: number): TimeColorTint {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

/** Teinte idéale pour un instant donné, interpolée entre les ancres */
export function getTintAtTime(date: Date): TimeColorTint {
  const h = date.getHours() + date.getMinutes() / 60

  for (let i = 0; i < TIME_ANCHORS.length - 1; i++) {
    const a = TIME_ANCHORS[i]
    const b = TIME_ANCHORS[i + 1]
    if (h >= a.hour && h < b.hour) {
      const t = (h - a.hour) / (b.hour - a.hour)
      return lerpTint(a.tint, b.tint, t)
    }
  }
  return [...TIME_ANCHORS[0].tint] as TimeColorTint
}

/** Teinte pour le slot de 5 minutes courant (arrondi au plancher) */
export function getSlotTint(): TimeColorTint {
  const now = new Date()
  const snapped = new Date(now)
  snapped.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0)
  return getTintAtTime(snapped)
}

/** Label du moment courant */
export function getTimeMomentLabel(): string {
  const h = new Date().getHours()
  if (h >= 23 || h < 5) return 'nuit'
  if (h < 7) return 'aube'
  if (h < 12) return 'matin'
  if (h < 14) return 'midi'
  if (h < 18) return 'ap.-midi'
  if (h < 21) return 'soir'
  return 'crépuscule'
}
