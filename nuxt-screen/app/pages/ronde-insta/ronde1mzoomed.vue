<template>
  <div class="patch-page">
    <ClientOnly>
      <HydraCanvas :patch-factory="createRonde1mzoomedPatch" :bands="bands" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { HydraBandValues } from '~/utils/hydra/types'
import { createRonde1mzoomedPatch } from '~/utils/hydra/ronde1mzoomedPatch'

const bands = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
</script>

<style scoped>
.patch-page { position: fixed; inset: 0; background: #000; }
</style>
