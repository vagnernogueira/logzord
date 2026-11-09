<script setup lang="ts">
import type { LogEntry } from '@/types'

defineProps<{
  filteredLogs: LogEntry[]
  isPlaying: boolean
  hasTarget: boolean
  syntaxHighlight: (content: string) => string
}>()
</script>

<template>
  <div
    id="log-container"
    class="lz-log"
  >
    <div
      v-if="filteredLogs.length === 0"
      class="lz-log__empty"
    >
      <span
        v-if="isPlaying"
        class="codicon codicon-loading codicon-modifier-spin lz-log__spinner"
      />
      <p v-if="!hasTarget">
        Selecione um log na árvore.
      </p>
      <p v-else>
        {{ isPlaying ? 'Aguardando logs...' : 'Streaming pausado.' }}
      </p>
    </div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      v-for="log in filteredLogs"
      :key="log.id"
      class="lz-log__line"
      v-html="syntaxHighlight(log.content)"
    />
  </div>
</template>
