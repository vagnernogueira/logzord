<script setup lang="ts">
import { computed } from 'vue'
import { useLogStream } from '@/composables/useLogStream'
import { useRecording } from '@/composables/useRecording'
import AppSidebar from '@/components/AppSidebar.vue'
import LogToolbar from '@/components/LogToolbar.vue'
import LogViewer from '@/components/LogViewer.vue'
import StatusBar from '@/components/StatusBar.vue'

const {
  targets,
  selectedTarget,
  isPlaying,
  filterText,
  filteredLogs,
  currentWsOffset,
  WS_URL,
  selectTarget,
  togglePlay,
  syntaxHighlight,
  setOnLogEntry,
  getWsState,
} = useLogStream()

const {
  isRecording,
  recordedCount,
  toggleRecord,
  recordLine,
  clearRecord,
  exportRecord,
} = useRecording()

// Wire recording to log stream via callback
setOnLogEntry((line: string, offset: number) => {
  recordLine(line, offset, filterText.value)
})

// Expose reactive wsState for StatusBar
const wsState = computed(() => getWsState())
</script>

<template>
  <div class="flex h-screen w-full bg-slate-950 text-slate-300 font-sans dark custom-scrollbar">
    <AppSidebar
      :targets="targets"
      :selected-target="selectedTarget"
      :recorded-count="recordedCount"
      :is-recording="isRecording"
      @select-target="selectTarget"
      @export-record="exportRecord"
      @clear-record="clearRecord"
      @toggle-record="toggleRecord"
    />

    <main class="flex-1 flex flex-col min-w-0 bg-slate-950 relative overflow-hidden">
      <LogToolbar
        :is-playing="isPlaying"
        :is-recording="isRecording"
        :filter-text="filterText"
        @toggle-play="togglePlay"
        @toggle-record="toggleRecord"
        @update:filter-text="filterText = $event"
      />

      <LogViewer
        :filtered-logs="filteredLogs"
        :is-playing="isPlaying"
        :syntax-highlight="syntaxHighlight"
      />

      <StatusBar
        :ws-state="wsState"
        :ws-url="WS_URL"
        :current-ws-offset="currentWsOffset"
      />
    </main>
  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 1);
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(51, 65, 85, 1);
  border-radius: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(71, 85, 105, 1);
}

.glow {
  box-shadow: 0 0 15px rgba(37, 99, 235, 0.5);
}

.pulse-ring {
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
  animation: pulse-ring 2s infinite cubic-bezier(0.66, 0, 0, 1);
}

@keyframes pulse-ring {
  to {
    box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
  }
}
</style>
