<template>
  <div class="shell">
    <slot />
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
const route = useRoute()
const config = useRuntimeConfig()
const { bands, start, stop } = useAudioBands({ micResetMs: config.public.micResetMs as number })

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

let reloadTimer: ReturnType<typeof setInterval> | null = null
const hydraPrefixes = ['/waves', '/circles', '/ronde-insta']
const isHydraRoute = computed(() => hydraPrefixes.some(prefix => route.path.startsWith(prefix)))
const isLocked = computed(() => isHydraRoute.value && !unlocked.value)

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
  start()
  const ms = config.public.reloadIntervalMs as number
  if (ms > 0) {
    reloadTimer = setInterval(() => { reloadKey.value++ }, ms)
  }
})

onBeforeUnmount(() => {
  stop()
  if (reloadTimer) clearInterval(reloadTimer)
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
