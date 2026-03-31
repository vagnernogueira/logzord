<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  wsState: number | undefined
  wsUrl: string
  currentWsOffset: number
}>()

const isConnected = computed(() => props.wsState === 1)
</script>

<template>
  <footer class="h-8 border-t border-slate-800 bg-slate-900 flex items-center px-4 justify-between text-xs text-slate-500">
    <div class="flex items-center gap-2">
      <div
        class="w-2 h-2 rounded-full"
        :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
      />
      <span>{{ isConnected ? `Conectado (${wsUrl})` : 'Desconectado' }}</span>
    </div>
    <div class="font-mono">
      OFFSET: <Badge
        variant="secondary"
        class="font-mono font-bold text-slate-300"
      >
        {{ currentWsOffset }} bytes
      </Badge>
    </div>
  </footer>
</template>
