import type { HydraBandValues } from '~/utils/hydra/types'

const FFT_SIZE = 512
const SENS_GAIN = 4.0
const IOS_MOBILE_GAIN_MULTIPLIER = 8
const NOISE_FLOOR = 0.15
const RPI_NOISE_FLOOR = 0.23  // seuil plus élevé pour filtrer les bruits faibles sur raspberry
const GAIN = 1
const GAMMA = 0.7
const HIGH_EXTRA_GAIN = 3.0   // boost aigus sur raspberry
const HIGH_DEFAULT_GAIN = 2.2 // boost aigus sur tous les autres appareils
const ATTACK = 0.45
const RELEASE_BASE = 0.03
const LIQUID_SMOOTH = 0.14   // lissage sortie pour notes tenues (EMA)
const SILENCE_GATE = 0.04
const RPI_SILENCE_GATE = 0.07  // gate plus élevé pour éviter les déclenchements parasites sur raspberry
const SILENCE_FRAMES = 8      // ~133ms à 60fps avant de tomber au noir

function isIOSMobile(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const uaDataMobile = typeof (navigator as any).userAgentData?.mobile === 'boolean'
    ? (navigator as any).userAgentData.mobile
    : false
  const coarsePointer = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false
  const isMobile = /Mobi|iPhone|iPod|iPad/.test(ua) || uaDataMobile || coarsePointer
  return isIOS && isMobile
}

const BROADCAST_CHANNEL = 'audio-bands'

export function useAudioBands(options?: { micResetMs?: number, broadcast?: boolean }) {
  const micResetMs = options?.micResetMs ?? 240000
  const shouldBroadcast = options?.broadcast ?? false
  const { public: { deviceProfile } } = useRuntimeConfig()

  const isRpi = deviceProfile === 'raspberry'
  const noiseFloor = isRpi ? RPI_NOISE_FLOOR : NOISE_FLOOR
  const silenceGate = isRpi ? RPI_SILENCE_GATE : SILENCE_GATE

  const bands = reactive<HydraBandValues>({ low: 0, mid1: 0, mid2: 0, high: 0 })
  const micRestarts = ref(0)

  let ctx: AudioContext | null = null
  let streamRef: MediaStream | null = null
  let zeroOut: GainNode | null = null
  let pre: GainNode | null = null

  let anLow: AnalyserNode[] = []
  let anM1: AnalyserNode[] = []
  let anM2: AnalyserNode[] = []
  let anHigh: AnalyserNode[] = []
  let bufLow: Float32Array[] = []
  let bufM1: Float32Array[] = []
  let bufM2: Float32Array[] = []
  let bufHigh: Float32Array[] = []

  const belowCnt: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const prevBands: Record<string, number> = { low: 0, mid1: 0, mid2: 0, high: 0 }
  const smoothOut = { low: 0, mid1: 0, mid2: 0, high: 0 }

  let micResetTimerId: ReturnType<typeof setInterval> | null = null
  let micRestarting = false
  let tickId: number | null = null
  let bcSender: BroadcastChannel | null = null
  let bcReceiver: BroadcastChannel | null = null

  function levelFromBuffer(buf: Float32Array): number {
    let s = 0, peak = 0
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i], ax = x < 0 ? -x : x
      s += x * x
      if (ax > peak) peak = ax
    }
    const rms = Math.sqrt(s / buf.length)
    let yR = Math.max(0, rms - noiseFloor) * GAIN
    if (yR > 1) yR = 1
    yR = Math.pow(yR, GAMMA)
    let yP = Math.max(0, peak - noiseFloor * 0.5) * (GAIN * 1.25)
    if (yP > 1) yP = 1
    yP = Math.pow(yP, GAMMA)
    return Math.max(yR, yP)
  }

  function levelFromAnalyser(an: AnalyserNode, buf: Float32Array): number {
    an.getFloatTimeDomainData(buf)
    return levelFromBuffer(buf)
  }

  function levelFromAnalysersMax(list: AnalyserNode[], buffers: Float32Array[]): number {
    if (!list.length) return 0
    let m = 0
    for (let i = 0; i < list.length; i++) {
      const v = levelFromAnalyser(list[i], buffers[i])
      if (v > m) m = v
    }
    return m
  }

  function applyEnv(name: string, prev: number, next: number): number {
    if (next < silenceGate) belowCnt[name]++
    else belowCnt[name] = 0
    if (belowCnt[name] >= SILENCE_FRAMES) return 0
    if (next >= prev) return prev + (next - prev) * ATTACK
    const rel = prev < 0.12 ? 0.50 : prev < 0.25 ? 0.20 : RELEASE_BASE
    return prev + (next - prev) * rel
  }

  function buildBandGraph() {
    if (!ctx || !pre || !zeroOut) return
    anLow = []; anM1 = []; anM2 = []; anHigh = []
    bufLow = []; bufM1 = []; bufM2 = []; bufHigh = []

    // LOW
    const dcCut = ctx.createBiquadFilter()
    dcCut.type = 'highpass'; dcCut.frequency.value = 30; dcCut.Q.value = 0.707
    const lsLow = ctx.createBiquadFilter()
    lsLow.type = 'lowshelf'; lsLow.frequency.value = 150; lsLow.gain.value = 4
    pre.connect(dcCut); dcCut.connect(lsLow)
    for (const f of [180, 200, 230]) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = f; lp.Q.value = 0.707
      lsLow.connect(lp)
      const an = ctx.createAnalyser(); an.fftSize = FFT_SIZE
      lp.connect(an); an.connect(zeroOut); anLow.push(an)
    }

    // MID1
    const pkM1 = ctx.createBiquadFilter()
    pkM1.type = 'peaking'; pkM1.frequency.value = 500; pkM1.Q.value = 0.9; pkM1.gain.value = 3
    pre.connect(pkM1)
    for (const [fhp, flp] of [[180, 900], [200, 1000], [220, 1100]]) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = fhp; hp.Q.value = 0.707
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = flp; lp.Q.value = 0.707
      pkM1.connect(hp); hp.connect(lp)
      const an = ctx.createAnalyser(); an.fftSize = FFT_SIZE
      lp.connect(an); an.connect(zeroOut); anM1.push(an)
    }

    // MID2
    const pkM2 = ctx.createBiquadFilter()
    pkM2.type = 'peaking'; pkM2.frequency.value = 2000; pkM2.Q.value = 0.9; pkM2.gain.value = 3
    pre.connect(pkM2)
    for (const [fhp, flp] of [[900, 3600], [1000, 4000], [1100, 4600]]) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = fhp; hp.Q.value = 0.707
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = flp; lp.Q.value = 0.707
      pkM2.connect(hp); hp.connect(lp)
      const an = ctx.createAnalyser(); an.fftSize = FFT_SIZE
      lp.connect(an); an.connect(zeroOut); anM2.push(an)
    }

    // HIGH
    const hsH = ctx.createBiquadFilter()
    hsH.type = 'highshelf'; hsH.frequency.value = 5000; hsH.gain.value = 6
    const highBoost = ctx.createGain()
    highBoost.gain.value = deviceProfile === 'raspberry' ? HIGH_EXTRA_GAIN : HIGH_DEFAULT_GAIN
    pre.connect(hsH); hsH.connect(highBoost)
    for (const fhp of [3600, 4400, 5200]) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = fhp; hp.Q.value = 0.707
      highBoost.connect(hp)
      const an = ctx.createAnalyser(); an.fftSize = FFT_SIZE
      hp.connect(an); an.connect(zeroOut); anHigh.push(an)
    }

    bufLow = anLow.map(a => new Float32Array(a.fftSize))
    bufM1 = anM1.map(a => new Float32Array(a.fftSize))
    bufM2 = anM2.map(a => new Float32Array(a.fftSize))
    bufHigh = anHigh.map(a => new Float32Array(a.fftSize))
  }

  function tick() {
    const L = anLow.length ? levelFromAnalysersMax(anLow, bufLow) : 0
    const M1 = anM1.length ? levelFromAnalysersMax(anM1, bufM1) : 0
    const M2 = anM2.length ? levelFromAnalysersMax(anM2, bufM2) : 0
    const H = anHigh.length ? levelFromAnalysersMax(anHigh, bufHigh) : 0

    prevBands.low = applyEnv('low', prevBands.low, L)
    prevBands.mid1 = applyEnv('mid1', prevBands.mid1, M1)
    prevBands.mid2 = applyEnv('mid2', prevBands.mid2, M2)
    prevBands.high = applyEnv('high', prevBands.high, H)

    smoothOut.low  += (prevBands.low  - smoothOut.low)  * LIQUID_SMOOTH
    smoothOut.mid1 += (prevBands.mid1 - smoothOut.mid1) * LIQUID_SMOOTH
    smoothOut.mid2 += (prevBands.mid2 - smoothOut.mid2) * LIQUID_SMOOTH
    smoothOut.high += (prevBands.high - smoothOut.high) * LIQUID_SMOOTH

    bands.low = smoothOut.low
    bands.mid1 = smoothOut.mid1
    bands.mid2 = smoothOut.mid2
    bands.high = smoothOut.high

    if (bcSender) {
      bcSender.postMessage({ low: bands.low, mid1: bands.mid1, mid2: bands.mid2, high: bands.high })
    }

    tickId = requestAnimationFrame(tick)
  }

  async function startAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
          latency: { ideal: 0 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
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

      pre = ctx.createGain()
      const micGain = isIOSMobile() ? SENS_GAIN * IOS_MOBILE_GAIN_MULTIPLIER : SENS_GAIN
      pre.gain.value = micGain
      zeroOut = ctx.createGain()
      zeroOut.gain.value = 0.0
      zeroOut.connect(ctx.destination)

      src.connect(pre)
      buildBandGraph()

      if (micResetTimerId) clearInterval(micResetTimerId)
      micResetTimerId = setInterval(restartAudio, micResetMs)
    } catch {
      // mic denied or unavailable
    }
  }

  function stopAudio() {
    try { ;[...anLow, ...anM1, ...anM2, ...anHigh].forEach(an => { try { an.disconnect() } catch {} }) } catch {}
    try { pre?.disconnect() } catch {}
    try { zeroOut?.disconnect() } catch {}
    if (ctx && ctx.state !== 'closed') { try { ctx.close() } catch {} }
    if (streamRef) { try { streamRef.getTracks().forEach(t => t.stop()) } catch {} }
    ctx = null; streamRef = null; pre = null; zeroOut = null
    anLow = []; anM1 = []; anM2 = []; anHigh = []
    bufLow = []; bufM1 = []; bufM2 = []; bufHigh = []
  }

  async function restartAudio() {
    if (micRestarting) return
    micRestarting = true
    stopAudio()
    micRestarts.value++
    await startAudio()
    micRestarting = false
  }

  async function start() {
    if (shouldBroadcast) bcSender = new BroadcastChannel(BROADCAST_CHANNEL)
    tickId = requestAnimationFrame(tick)
    await startAudio()
  }

  function startReceiver() {
    bcReceiver = new BroadcastChannel(BROADCAST_CHANNEL)
    bcReceiver.onmessage = (e: MessageEvent) => {
      bands.low = e.data.low
      bands.mid1 = e.data.mid1
      bands.mid2 = e.data.mid2
      bands.high = e.data.high
    }
  }

  function stop() {
    if (tickId !== null) cancelAnimationFrame(tickId)
    tickId = null
    if (micResetTimerId) { clearInterval(micResetTimerId); micResetTimerId = null }
    bcSender?.close(); bcSender = null
    bcReceiver?.close(); bcReceiver = null
    stopAudio()
  }

  return { bands, micRestarts, start, startReceiver, stop }
}
