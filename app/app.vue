<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
// Reload préventif toutes les heures pour éviter l'OOM VRAM (Skia crash)
onMounted(() => {
  setTimeout(() => window.location.reload(), 60 * 60 * 1000)
})
</script>
