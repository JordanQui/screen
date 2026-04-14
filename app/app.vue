<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <div ref="fadeEl" class="fade-overlay" />
</template>

<script setup lang="ts">
const fadeEl = ref<HTMLDivElement | null>(null)

function reloadWithFade() {
  const el = fadeEl.value
  if (!el) { window.location.reload(); return }
  el.style.transition = 'opacity 400ms linear'
  el.style.opacity = '1'
  setTimeout(() => window.location.reload(), 420)
}

// Reload préventif toutes les heures pour éviter l'OOM VRAM (Skia crash)
onMounted(() => {
  setTimeout(reloadWithFade, 60 * 60 * 1000)
})
</script>

<style scoped>
.fade-overlay {
  position: fixed;
  inset: 0;
  background: #000;
  opacity: 0;
  pointer-events: none;
  z-index: 9999;
}
</style>
