<template>
  <div class="shell">
    <slot />
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { bands, start, stop } = useAudioBands({ micResetMs: config.public.micResetMs as number })

const reloadKey = ref(0)

provide('audioBands', bands)
provide('reloadKey', reloadKey)

let reloadTimer: ReturnType<typeof setInterval> | null = null

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
</script>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  background: #000;
}
</style>
