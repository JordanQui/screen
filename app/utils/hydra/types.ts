declare global {
  var time: number
  interface Window { Hydra?: any }
}

export type HydraBandValues = {
  low: number
  mid1: number
  mid2: number
  high: number
}

// Multiplicateurs RGB pour la teinte temporelle (1.0 = neutre)
export type TimeColorTint = [number, number, number]

export type HydraApi = {
  osc: (...args: any[]) => any
  noise: (...args: any[]) => any
  src: (...args: any[]) => any
  solid: (...args: any[]) => any
  shape: (...args: any[]) => any
  render: (...args: any[]) => void
  o0: any
  o1: any
  s0: any
}

export type HydraPatchController = {
  setBands: (bands: HydraBandValues) => void
  setColors?: (tint: TimeColorTint) => void
  stop: () => void
}

export type PatchFactory = (api: HydraApi) => HydraPatchController
