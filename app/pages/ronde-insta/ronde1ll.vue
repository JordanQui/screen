<template>
  <div class="patch-page">
    <ClientOnly>
      <HydraCanvas :reload-token="reloadKey" :patch-factory="createRonde1llPatch" :bands="bands" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import type { HydraBandValues } from '~/utils/hydra/types'
import { createRonde1llPatch } from '~/utils/hydra/ronde1llPatch'

const bands = inject<HydraBandValues>('audioBands', reactive({ low: 0, mid1: 0, mid2: 0, high: 0 }))
const reloadKey = inject<Ref<number>>('reloadKey', ref(0))
</script>

<style scoped>
.patch-page { position: fixed; inset: 0; background: #000; }
</style>
