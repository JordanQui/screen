<template>
  <div class="shell-stack">
    <ClientOnly>
      <HydraCanvas
        :key="cycleKey"
        :patch-factory="currentPatch"
        :bands="bands"
        @ready="onPatchReady"
      />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { HydraBandValues, PatchFactory } from '~/utils/hydra/types'
import { createWav1Patch } from '~/utils/hydra/wav1Patch'
import { createWav2Patch } from '~/utils/hydra/wav2Patch'
import { createWav3aPatch } from '~/utils/hydra/wav3aPatch'
import { createWav4aPatch } from '~/utils/hydra/wav4aPatch'
import { createWav5ePatch } from '~/utils/hydra/wav5ePatch'
import { createWav6aPatch } from '~/utils/hydra/wav6aPatch'
import { createWav7cPatch } from '~/utils/hydra/wav7cPatch'
import { createCircles1Patch } from '~/utils/hydra/circles1Patch'
import { createRonde1gPatch } from '~/utils/hydra/ronde1gPatch'
import { createRonde1iPatch } from '~/utils/hydra/ronde1iPatch'
import { createRonde1jPatch } from '~/utils/hydra/ronde1jPatch'
import { createRonde1llPatch } from '~/utils/hydra/ronde1llPatch'
import { createRonde1mzoomedPatch } from '~/utils/hydra/ronde1mzoomedPatch'

const bands = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
const swapIntervalMs = inject<number>('swapIntervalMs', 500000)

const patches: PatchFactory[] = [
  createWav1Patch,
  createWav2Patch,
  createWav3aPatch,
  createWav4aPatch,
  createWav5ePatch,
  createWav6aPatch,
  createWav7cPatch,
  createCircles1Patch,
  createRonde1gPatch,
  createRonde1iPatch,
  createRonde1jPatch,
  createRonde1llPatch,
  createRonde1mzoomedPatch,
]

const patchIndex = ref(0)
const cycleKey = ref(0)
const currentPatch = computed(() => patches[patchIndex.value % patches.length])

let swapTimer: ReturnType<typeof setInterval> | null = null

function onPatchReady() {
  // patch rendered first frame
}

function nextPatch() {
  patchIndex.value = (patchIndex.value + 1) % patches.length
  cycleKey.value++
}

onMounted(() => {
  swapTimer = setInterval(nextPatch, swapIntervalMs)
})

onBeforeUnmount(() => {
  if (swapTimer) clearInterval(swapTimer)
})
</script>

<style scoped>
.shell-stack {
  position: fixed;
  inset: 0;
  background: #000;
}
</style>
