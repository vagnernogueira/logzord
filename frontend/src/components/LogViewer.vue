<script setup lang="ts">
import { ref } from 'vue'
import type { LogEntry, LogViewport } from '@/types'

defineProps<{
  filteredLogs: LogEntry[]
  isPlaying: boolean
  hasTarget: boolean
}>()

// Folga em px para considerar a visão "no fim" (scrollTop fracionário, zoom).
const STICK_TO_BOTTOM_THRESHOLD = 8

const container = ref<HTMLElement | null>(null)

function isAtBottom(): boolean {
  const el = container.value
  if (!el) return true
  return el.scrollHeight - el.clientHeight - el.scrollTop <= STICK_TO_BOTTOM_THRESHOLD
}

function scrollToBottom() {
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight
  }
}

function scrollToTop() {
  if (container.value) {
    container.value.scrollTop = 0
  }
}

defineExpose<LogViewport>({ isAtBottom, scrollToBottom, scrollToTop })
</script>

<template>
  <div
    id="log-container"
    ref="container"
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
      v-html="log.html"
    />
  </div>
</template>
