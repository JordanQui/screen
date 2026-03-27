<template>
  <div class="shell">
    <slot />
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const { bands, start, stop } = useAudioBands({ micResetMs: config.public.micResetMs as number })

provide('audioBands', bands)
provide('swapIntervalMs', config.public.swapIntervalMs)

onMounted(() => start())
onBeforeUnmount(() => stop())
</script>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  background: #000;
}
</style>
