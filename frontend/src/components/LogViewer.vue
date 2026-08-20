<script setup lang="ts">
import type { LogEntry } from '@/types'

defineProps<{
  filteredLogs: LogEntry[]
  isPlaying: boolean
  syntaxHighlight: (content: string) => string
}>()
</script>

<template>
  <div
    id="log-container"
    class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed scroll-smooth"
  >
    <div
      v-if="filteredLogs.length === 0"
      class="h-full flex items-center justify-center text-muted-foreground flex-col"
    >
      <div
        v-if="isPlaying"
        class="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin mb-4 opacity-50"
      />
      <p>{{ isPlaying ? 'Aguardando logs...' : 'Streaming pausado. Clique no Play para iniciar.' }}</p>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      v-for="log in filteredLogs"
      :key="log.id"
      class="hover:bg-accent/50 px-2 py-0.5 rounded transition-colors break-all whitespace-pre-wrap border-l-2 border-transparent hover:border-border"
      v-html="syntaxHighlight(log.content)"
    />
  </div>
</template>
