<template>
  <div class="patch-page">
    <ClientOnly>
      <HydraCanvas :key="reloadKey" :patch-factory="createRonde1mzoomedPatch" :bands="bands" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { HydraBandValues } from '~/utils/hydra/types'
import { createRonde1mzoomedPatch } from '~/utils/hydra/ronde1mzoomedPatch'

const bands = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
const reloadKey = inject<Ref<number>>('reloadKey', ref(0))
</script>

<style scoped>
.patch-page { position: fixed; inset: 0; background: #000; }
</style>
