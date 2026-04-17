<template>
  <div v-if="showMicPrompt" class="mic-overlay" @click="requestMicPermission">
    <span>Tap to enable audio</span>
  </div>
  <div class="grid">
    <NuxtLink
      v-for="patch in patches"
      :key="patch.path"
      :to="patch.path"
      class="cell"
    >
      <iframe
        :src="patch.path + '?embed=1'"
        scrolling="no"
        frameborder="0"
        tabindex="-1"
        allow="microphone"
      />
      <span class="label">{{ patch.name }}</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
const patches = [
  { path: '/waves/wav6a', name: 'wav6a' },
  { path: '/waves/fmbell', name: 'fmbell' },
  { path: '/waves/wav8', name: 'wav8' },
  { path: '/waves/wav9', name: 'wav9' },
  // { path: '/ronde-insta/roseace_ronde', name: 'roseace_ronde' },
]

const showMicPrompt = ref(false)

onMounted(() => {
  const alreadyGranted = localStorage.getItem('mic-permission-asked')
  if (!alreadyGranted) {
    showMicPrompt.value = true
  }
})

async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(t => t.stop())
  } catch {}
  localStorage.setItem('mic-permission-asked', '1')
  showMicPrompt.value = false
}
</script>

<style>
html, body { margin: 0; padding: 0; background: #000; height: auto; }
</style>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0;
  margin: 0;
  padding: 0;
  background: #000;
  min-height: 100vh;
}

.cell {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  display: block;
  cursor: pointer;
}

.cell iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none;
}

.mic-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  font-family: monospace;
  font-size: 1.2rem;
  cursor: pointer;
}

.label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-family: monospace;
  font-size: 0.65rem;
}
</style>
