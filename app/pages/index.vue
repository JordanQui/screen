<template>
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
      />
      <span class="label">{{ patch.name }}</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
const patches = [
  { path: '/waves/wav6a', name: 'wav6a' },
  { path: '/waves/wav7c', name: 'wav7c' },
  { path: '/waves/wav8', name: 'wav8' },
  { path: '/waves/wav9', name: 'wav9' },
  { path: '/ronde-insta/roseace_ronde', name: 'roseace_ronde' },
]
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
  opacity: 0;
  transition: opacity 0.15s;
}

.cell:hover .label {
  opacity: 1;
}
</style>
