<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLogStream } from '@/composables/useLogStream'
import { useRecording } from '@/composables/useRecording'
import type { Target } from '@/types'
import {
  ShellActivityBar,
  ShellSidebar,
  ShellTabs,
  ShellPanel,
} from '@vagnernogueira/vsshellcode/vue'
import { views } from '@/views.config'
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

setOnLogEntry((line: string, offset: number) => {
  recordLine(line, offset, filterText.value)
})

const wsState = computed(() => getWsState())

const activeSection = ref<string | null>(views[0]?.id ?? null)
const activeView = computed(
  () => views.find(({ id }) => id === activeSection.value) ?? views[0],
)
const openTargetIds = ref<string[]>([])

watch(selectedTarget, (target) => {
  if (target && !openTargetIds.value.includes(target.id)) {
    openTargetIds.value.push(target.id)
  }
})

const tabs = computed(() =>
  openTargetIds.value
    .map((id) => targets.value.find((target) => target.id === id))
    .filter((target): target is Target => !!target)
    .map((target) => ({ id: target.id, label: target.name, icon: 'file' })),
)

function activateTab(id: string) {
  const target = targets.value.find((item) => item.id === id)
  if (target) selectTarget(target)
}

function closeTab(id: string) {
  if (openTargetIds.value.length <= 1) return

  const closingActive = selectedTarget.value?.id === id
  openTargetIds.value = openTargetIds.value.filter((tabId) => tabId !== id)

  if (closingActive) {
    const fallbackId = openTargetIds.value[openTargetIds.value.length - 1]
    const fallback = targets.value.find((target) => target.id === fallbackId)
    if (fallback) selectTarget(fallback)
  }
}

const panelOpen = ref(false)
</script>

<template>
  <div class="shell dark custom-scrollbar">
    <ShellActivityBar
      v-model:activeId="activeSection"
      :items="views"
    />

    <ShellSidebar :open="activeSection !== null">
      <component
        :is="activeView.component"
        :targets="targets"
        :selected-target="selectedTarget"
        :recorded-count="recordedCount"
        :is-recording="isRecording"
        @select-target="selectTarget"
        @export-record="exportRecord"
        @clear-record="clearRecord"
      />
    </ShellSidebar>

    <div class="main">
      <ShellTabs
        :tabs="tabs"
        :active-tab-id="selectedTarget?.id ?? null"
        @update:active-tab-id="activateTab"
        @close="closeTab"
      />

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

      <ShellPanel :open="panelOpen" />
    </div>

    <StatusBar
      :ws-state="wsState"
      :ws-url="WS_URL"
      :current-ws-offset="currentWsOffset"
    />
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
