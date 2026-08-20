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
  ShellStatusBar,
  useShellKeybindings,
  type ShellStatusBarItem,
} from '@vagnernogueira/vsshellcode/vue'
import { views } from '@/views.config'
import LogToolbar from '@/components/LogToolbar.vue'
import LogViewer from '@/components/LogViewer.vue'

const {
  targets,
  selectedTarget,
  isPlaying,
  filterText,
  filteredLogs,
  currentWsOffset,
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
const lastActiveViewId = ref<string | null>(activeSection.value)
const activeView = computed(() => views.find(({ id }) => id === activeSection.value) ?? views[0]!)

watch(activeSection, (id) => {
  if (id !== null) {
    lastActiveViewId.value = id
  }
})

const activeViewProps = computed(() =>
  activeView.value.id === 'targets'
    ? {
        targets: targets.value,
        selectedTarget: selectedTarget.value,
      }
    : {
        recordedCount: recordedCount.value,
        isRecording: isRecording.value,
      },
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

function toggleSidebar() {
  if (activeSection.value === null) {
    activeSection.value = lastActiveViewId.value ?? views[0]?.id ?? null
    return
  }

  lastActiveViewId.value = activeSection.value
  activeSection.value = null
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
}

function openCommandPalette() {}

useShellKeybindings({
  onToggleSidebar: toggleSidebar,
  onTogglePanel: togglePanel,
  onOpenCommandPalette: openCommandPalette,
})

const statusBarLeftItems = computed<ShellStatusBarItem[]>(() => [
  {
    id: 'ws-state',
    icon: wsState.value === 1 ? 'circle-filled' : 'circle-outline',
    label: wsState.value === 1 ? 'Conectado' : 'Desconectado',
  },
  {
    id: 'panel',
    icon: panelOpen.value ? 'panel-close' : 'panel-right',
    label: 'Panel',
  },
])

const statusBarRightItems = computed<ShellStatusBarItem[]>(() => [
  {
    id: 'offset',
    label: `OFFSET: ${currentWsOffset} bytes`,
  },
])

function handleStatusBarItemClick(id: string) {
  if (id === 'panel') {
    togglePanel()
  }
}
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
        v-bind="activeViewProps"
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

    <ShellStatusBar
      :left-items="statusBarLeftItems"
      :right-items="statusBarRightItems"
      @item-click="handleStatusBarItemClick"
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
