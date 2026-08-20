<script setup lang="ts">
import type { Target } from '@/types'

defineProps<{
  targets: Target[]
  selectedTarget: Target | null
}>()

const emit = defineEmits<{
  'select-target': [target: Target]
}>()
</script>

<template>
  <div class="p-2">
    <ul class="space-y-1">
      <li
        v-for="target in targets"
        :key="target.id"
      >
        <button
          class="w-full text-left px-3 py-2 rounded-md transition-all duration-200 text-sm flex items-center"
          :class="selectedTarget?.id === target.id ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-accent text-muted-foreground'"
          @click="emit('select-target', target)"
        >
          <div
            class="w-2 h-2 rounded-full mr-2"
            :class="selectedTarget?.id === target.id ? 'bg-primary-foreground' : 'bg-muted-foreground'"
          />
          {{ target.name }}
        </button>
      </li>
    </ul>
  </div>
</template>
