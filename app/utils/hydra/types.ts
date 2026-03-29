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

export type HydraApi = {
  osc: (...args: any[]) => any
  noise: (...args: any[]) => any
  src: (...args: any[]) => any
  solid: (...args: any[]) => any
  shape: (...args: any[]) => any
  render: (...args: any[]) => void
  o0: any
  o1: any
}

export type HydraPatchController = {
  setBands: (bands: HydraBandValues) => void
  stop: () => void
}

export type PatchFactory = (api: HydraApi) => HydraPatchController
