<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLogStream } from '@/composables/useLogStream'
import { useRecording } from '@/composables/useRecording'
import type { LogRotation, LogTreeTarget } from '@/types'
import { findTargetById } from '@/lib/logTree'
import {
  ShellTitleBar,
  ShellTitleBarAction,
  ShellTitleBarSearch,
  ShellTitleBarSearchToggle,
  ShellActivityBar,
  ShellSidebar,
  ShellTabs,
  ShellStatusBar,
  ShellCommandPalette,
  useShellKeybindings,
  useShellViewport,
  type ShellTitleBarMenuItem,
  type ShellStatusBarItem,
} from '@vagnernogueira/vsshellcode/vue'
import { commands } from '@/commands.config'
import { views } from '@/views.config'
import LogViewer from '@/components/LogViewer.vue'

const {
  tree,
  selectedTarget,
  isPlaying,
  filterText,
  filterMode,
  lineMatcher,
  filterError,
  filteredLogs,
  currentWsOffset,
  availableRotations,
  rotationsLoading,
  selectTarget,
  clearTarget,
  forgetTarget: forgetPlayState,
  togglePlay,
  rewind,
  fastForward,
  canRewind,
  downloadLog,
  setOnLogEntries,
  getWsState,
  fetchRotationsFor,
  addRotation,
} = useLogStream()

const {
  isRecording,
  recordedCount,
  recordError,
  toggleRecord,
  forgetTarget: forgetRecordState,
  recordLines,
  clearRecord,
  exportRecord,
} = useRecording(computed(() => selectedTarget.value?.id ?? null))

setOnLogEntries((lines) => {
  void recordLines(lines, lineMatcher.value.matches)
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

const viewPropsContext = computed(() => ({
  tree: tree.value,
  selectedTarget: selectedTarget.value,
  availableRotations: availableRotations.value,
  rotationsLoading: rotationsLoading.value,
  recordedCount: recordedCount.value,
  isRecording: isRecording.value,
  recordError: recordError.value,
}))
const activeViewProps = computed(() => activeView.value.props(viewPropsContext.value))
const openTargetIds = ref<string[]>([])

watch(selectedTarget, (target) => {
  if (target && !openTargetIds.value.includes(target.id)) {
    openTargetIds.value.push(target.id)
  }
})

const tabs = computed(() =>
  openTargetIds.value
    .map((id) => findTargetById(tree.value, id))
    .filter((target): target is LogTreeTarget => !!target)
    .map((target) => ({ id: target.id, label: target.label, icon: 'file' })),
)

function activateTab(id: string) {
  const target = findTargetById(tree.value, id)
  if (target) selectTarget(target)
}

// Em tela estreita a sidebar fica em overlay sobre o log (vsshellcode#18); ver issue #27.
const { isNarrow } = useShellViewport()

function selectTargetFromSidebar(target: LogTreeTarget) {
  selectTarget(target)
  if (isNarrow.value) toggleSidebar()
}

function requestRotations(target: LogTreeTarget) {
  void fetchRotationsFor(target)
}

function addTargetRotation(target: LogTreeTarget, rotation: LogRotation) {
  addRotation(target, rotation)
}

function closeTab(id: string) {
  const closingActive = selectedTarget.value?.id === id
  openTargetIds.value = openTargetIds.value.filter((tabId) => tabId !== id)

  if (closingActive) {
    const fallbackId = openTargetIds.value[openTargetIds.value.length - 1]
    const fallback = fallbackId ? findTargetById(tree.value, fallbackId) : null
    if (fallback) selectTarget(fallback)
    else clearTarget()
  }
  // Depois da troca: selectTarget guarda o estado da aba que deixa o foco, e a aba fechada não deve sobrar.
  forgetPlayState(id)
  forgetRecordState(id)
}

function toggleSidebar() {
  if (activeSection.value === null) {
    activeSection.value = lastActiveViewId.value ?? views[0]?.id ?? null
    return
  }

  lastActiveViewId.value = activeSection.value
  activeSection.value = null
}

// Painel inferior removido da UI; stub mantido pois onTogglePanel é obrigatório em useShellKeybindings (vsshellcode).
function togglePanel() {}

const paletteOpen = ref(false)

function openCommandPalette() {
  paletteOpen.value = true
}

const commandHandlers: Record<string, () => void> = {
  'toggle-sidebar': toggleSidebar,
  'toggle-play': togglePlay,
  'stream-rewind': rewind,
  'stream-fast-forward': fastForward,
  'download-log': downloadLog,
  'toggle-record': toggleRecord,
  'export-record': () => void exportRecord(),
  'clear-record': () => void clearRecord(),
}

function executeCommand(id: string) {
  commandHandlers[id]?.()
  paletteOpen.value = false
}

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
])

const statusBarRightItems = computed<ShellStatusBarItem[]>(() => [
  {
    id: 'offset',
    icon: 'symbol-ruler',
    label: `OFFSET: ${currentWsOffset.value} bytes`,
  },
])

const titleBarMenuItems: ShellTitleBarMenuItem[] = []
</script>

<template>
  <div class="shell">
    <ShellTitleBar :menu-items="titleBarMenuItems">
      <template #icon>
        <span
          class="codicon codicon-output"
          role="img"
          aria-label="Logzord"
        />
      </template>

      <template #search>
        <ShellTitleBarSearch
          v-model="filterText"
          placeholder="Filtrar logs..."
          :error="filterError"
        >
          <template #toggles>
            <ShellTitleBarSearchToggle
              icon="regex"
              title="Usar expressão regular"
              :pressed="filterMode === 'regex'"
              @update:pressed="filterMode = $event ? 'regex' : 'substring'"
            />
          </template>
        </ShellTitleBarSearch>
      </template>

      <template #actions>
        <ShellTitleBarAction
          :icon="isPlaying ? 'debug-pause' : 'debug-start'"
          :title="isPlaying ? 'Pausar streaming' : 'Iniciar streaming'"
          @click="togglePlay"
        />
        <ShellTitleBarAction
          icon="debug-reverse-continue"
          title="Retroceder"
          :disabled="!canRewind"
          @click="rewind"
        />
        <ShellTitleBarAction
          icon="debug-continue"
          title="Ir para o fim (ao vivo)"
          aria-label="Avançar"
          :disabled="!selectedTarget"
          @click="fastForward"
        />
        <ShellTitleBarAction
          icon="cloud-download"
          title="Baixar o arquivo de log (.gz acima de 5MB)"
          aria-label="Baixar log"
          :disabled="!selectedTarget"
          @click="downloadLog"
        />
        <ShellTitleBarAction
          icon="record"
          :class="{ 'lz-recording': isRecording }"
          :pressed="isRecording"
          :title="isRecording ? 'Parar gravação no Quadro de Análise' : 'Iniciar gravação no Quadro de Análise'"
          :aria-label="isRecording ? 'Parar gravação' : 'Iniciar gravação'"
          @click="toggleRecord"
        />
      </template>
    </ShellTitleBar>

    <ShellActivityBar
      v-model:active-id="activeSection"
      :items="views"
    />

    <ShellSidebar
      :open="activeSection !== null"
      @dismiss="toggleSidebar"
    >
      <component
        :is="activeView.component"
        v-bind="activeViewProps"
        @select-target="selectTargetFromSidebar"
        @request-rotations="requestRotations"
        @add-rotation="addTargetRotation"
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

      <div class="editor-area lz-editor-area">
        <LogViewer
          :filtered-logs="filteredLogs"
          :is-playing="isPlaying"
          :has-target="!!selectedTarget"
        />
      </div>
    </div>

    <ShellStatusBar
      :left-items="statusBarLeftItems"
      :right-items="statusBarRightItems"
    />

    <ShellCommandPalette
      :open="paletteOpen"
      :commands="commands"
      @close="paletteOpen = false"
      @execute="executeCommand"
    />
  </div>
</template>
