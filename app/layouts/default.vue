<template>
  <div class="shell">
    <slot />

    <button
      v-if="isHydraRoute && !isLocked && !isEmbed"
      class="time-color-toggle"
      :class="{ 'tct-on': timeColorsEnabled }"
      @click="toggleTimeColors"
      :title="timeColorsEnabled ? 'Désactiver couleurs temporelles' : 'Activer couleurs temporelles'"
    >
      <span class="tct-dot" :style="dotStyle" />
      <span class="tct-label">{{ timeLabel }}</span>
    </button>

    <div v-if="isLocked" class="lock-overlay">
      <form class="lock-card" @submit.prevent="submitPassword">
        <div class="lock-title">Acces protege</div>
        <div class="lock-sub">Entrez le mot de passe pour ouvrir le patch.</div>
        <input
          ref="passwordInput"
          v-model="password"
          class="lock-input"
          type="password"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Mot de passe"
        />
        <button class="lock-button" type="submit">Valider</button>
        <div v-if="showError" class="lock-error">Mot de passe incorrect.</div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getTimeMomentLabel } from '~/utils/hydra/timeColors'

const route = useRoute()
const config = useRuntimeConfig()

// Mode embed : iframe de preview — pas d'audio, pas de verrou
const isEmbed = computed(() =>
  !!route.query.embed || (import.meta.client && window.parent !== window),
)

const { bands, start, stop } = useAudioBands({ micResetMs: config.public.micResetMs as number })
const { enabled: timeColorsEnabled, currentTint, toggle: toggleTimeColors } = useTimeColors()

const reloadKey = ref(0)
const SESSION_KEY = 'hydraUnlocked'
const unlocked = useState('hydraUnlocked', () => {
  if (import.meta.client) return sessionStorage.getItem(SESSION_KEY) === '1'
  return false
})
const password = ref('')
const showError = ref(false)
const passwordInput = ref<HTMLInputElement | null>(null)

provide('audioBands', bands)
provide('reloadKey', reloadKey)
provide('timeColorTint', currentTint)

const timeLabel = ref(getTimeMomentLabel())
let labelInterval: ReturnType<typeof setInterval> | null = null

const dotStyle = computed(() => {
  if (!timeColorsEnabled.value) return {}
  const [r, g, b] = currentTint.value
  const max = Math.max(r, g, b, 0.001)
  return {
    background: `rgb(${Math.round((r / max) * 210)}, ${Math.round((g / max) * 210)}, ${Math.round((b / max) * 210)})`,
  }
})

let reloadTimer: ReturnType<typeof setInterval> | null = null
const hydraPrefixes = ['/waves', '/circles', '/ronde-insta']
const isHydraRoute = computed(() => hydraPrefixes.some(prefix => route.path.startsWith(prefix)))
// Jamais de verrou dans un iframe de preview
const isLocked = computed(() => !isEmbed.value && isHydraRoute.value && !unlocked.value)

function submitPassword() {
  if (password.value === '123') {
    unlocked.value = true
    sessionStorage.setItem(SESSION_KEY, '1')
    showError.value = false
    password.value = ''
    return
  }
  showError.value = true
  password.value = ''
}

onMounted(() => {
  // En mode embed (iframe preview), on ne demande pas le micro
  if (!isEmbed.value) {
    start()
    const ms = config.public.reloadIntervalMs as number
    if (ms > 0) {
      reloadTimer = setInterval(() => { reloadKey.value++ }, ms)
    }
    labelInterval = setInterval(() => { timeLabel.value = getTimeMomentLabel() }, 60_000)
  }
})

onBeforeUnmount(() => {
  if (!isEmbed.value) stop()
  if (reloadTimer) clearInterval(reloadTimer)
  if (labelInterval) clearInterval(labelInterval)
})

watch(isLocked, (locked) => {
  if (!locked) return
  showError.value = false
  password.value = ''
  nextTick(() => { passwordInput.value?.focus() })
})

</script>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  background: #000;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.time-color-toggle {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 7px;
  border-radius: 20px;
  border: 1px solid #2a2a2a;
  background: rgba(10, 10, 10, 0.75);
  backdrop-filter: blur(6px);
  cursor: pointer;
  opacity: 0.25;
  transition: opacity 0.2s ease, border-color 0.2s ease;
  font-family: monospace;
}

.time-color-toggle:hover {
  opacity: 1;
  border-color: #444;
}

.time-color-toggle.tct-on {
  opacity: 0.65;
  border-color: #3a3a3a;
}

.time-color-toggle.tct-on:hover {
  opacity: 1;
}

.tct-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
  flex-shrink: 0;
  transition: background 2s ease;
}

.tct-label {
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: #aaa;
  text-transform: lowercase;
  user-select: none;
}

.lock-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(6px);
  z-index: 1000;
}

.lock-card {
  width: min(90vw, 360px);
  padding: 1.5rem;
  border-radius: 10px;
  background: #0b0b0b;
  border: 1px solid #222;
  color: #e7e7e7;
  font-family: monospace;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}

.lock-title {
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lock-sub {
  font-size: 0.9rem;
  color: #a6a6a6;
}

.lock-input {
  padding: 0.7rem 0.8rem;
  border-radius: 6px;
  border: 1px solid #2d2d2d;
  background: #111;
  color: #f3f3f3;
  font-family: inherit;
  font-size: 16px;
  outline: none;
}

.lock-input:focus {
  border-color: #5b5b5b;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08);
}

.lock-button {
  padding: 0.7rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #3a3a3a;
  background: #1c1c1c;
  color: #f3f3f3;
  cursor: pointer;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.lock-button:hover {
  background: #242424;
  border-color: #555;
}

.lock-error {
  color: #ff8b8b;
  font-size: 0.85rem;
}
</style>
