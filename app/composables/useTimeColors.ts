import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { TimeColorTint } from '~/utils/hydra/timeColors'
import { getSlotTint, lerpTint } from '~/utils/hydra/timeColors'

const STORAGE_KEY = 'hydra-time-colors-enabled'
// ~20s pour atteindre 99% de la cible à 60fps : (1 - k)^(20×60) ≈ 0.01, k ≈ 0.004
const LERP_SPEED = 0.004

export function useTimeColors() {
  const enabled = ref(false)
  const currentTint = ref<TimeColorTint>([1, 1, 1])

  let _current: TimeColorTint = [1, 1, 1]
  let _target: TimeColorTint = [1, 1, 1]
  let _lastSlot = -1
  let _frameId: number | null = null

  function getSlotIndex(): number {
    const now = new Date()
    return Math.floor((now.getHours() * 60 + now.getMinutes()) / 5)
  }

  function tick() {
    if (enabled.value) {
      // Détection de changement de slot (toutes les 5 min)
      const slot = getSlotIndex()
      if (slot !== _lastSlot) {
        _lastSlot = slot
        _target = getSlotTint()
      }
      _current = lerpTint(_current, _target, LERP_SPEED)
    } else {
      // Retour progressif vers neutre [1, 1, 1]
      _current = lerpTint(_current, [1, 1, 1], LERP_SPEED)
    }

    currentTint.value = _current
    _frameId = requestAnimationFrame(tick)
  }

  function toggle() {
    enabled.value = !enabled.value
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, enabled.value ? '1' : '0')
    }
    if (enabled.value) {
      _lastSlot = getSlotIndex()
      _target = getSlotTint()
    }
  }

  onMounted(() => {
    if (import.meta.client) {
      enabled.value = localStorage.getItem(STORAGE_KEY) === '1'
    }
    _lastSlot = getSlotIndex()
    _target = getSlotTint()
    if (enabled.value) {
      _current = [..._target] as TimeColorTint
      currentTint.value = _current
    }
    _frameId = requestAnimationFrame(tick)
  })

  onBeforeUnmount(() => {
    if (_frameId !== null) cancelAnimationFrame(_frameId)
  })

  return { enabled, currentTint, toggle }
}
