<template>
  <div class="patch-page">
    <ClientOnly>
      <HydraCanvas :patch-factory="createWav3aPatch" :bands="bands" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { HydraBandValues } from '~/utils/hydra/types'
import { createWav3aPatch } from '~/utils/hydra/wav3aPatch'

const bands = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
</script>

<style scoped>
.patch-page { position: fixed; inset: 0; background: #000; }
</style>
