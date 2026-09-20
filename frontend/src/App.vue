<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Play, Pause, FastForward, Rewind } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { useLogStream } from '@/composables/useLogStream'
import { useRecording } from '@/composables/useRecording'
import type { LogRotation, LogTreeTarget } from '@/types'
import { findTargetById } from '@/lib/logTree'
import {
  ShellTitleBar,
  ShellActivityBar,
  ShellSidebar,
  ShellTabs,
  ShellStatusBar,
  ShellCommandPalette,
  useShellKeybindings,
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
  filteredLogs,
  currentWsOffset,
  availableRotations,
  rotationsLoading,
  selectTarget,
  togglePlay,
  syntaxHighlight,
  setOnLogEntry,
  getWsState,
  fetchRotationsFor,
  addRotation,
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

const viewPropsContext = computed(() => ({
  tree: tree.value,
  selectedTarget: selectedTarget.value,
  availableRotations: availableRotations.value,
  rotationsLoading: rotationsLoading.value,
  recordedCount: recordedCount.value,
  isRecording: isRecording.value,
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

function requestRotations(target: LogTreeTarget) {
  void fetchRotationsFor(target)
}

function addTargetRotation(target: LogTreeTarget, rotation: LogRotation) {
  addRotation(target, rotation)
}

function closeTab(id: string) {
  if (openTargetIds.value.length <= 1) return

  const closingActive = selectedTarget.value?.id === id
  openTargetIds.value = openTargetIds.value.filter((tabId) => tabId !== id)

  if (closingActive) {
    const fallbackId = openTargetIds.value[openTargetIds.value.length - 1]
    const fallback = fallbackId ? findTargetById(tree.value, fallbackId) : null
    if (fallback) selectTarget(fallback)
  }
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
    label: `OFFSET: ${currentWsOffset.value} bytes`,
  },
])

const titleBarMenuItems: ShellTitleBarMenuItem[] = []
</script>

<template>
  <div class="shell dark custom-scrollbar">
    <ShellTitleBar :menu-items="titleBarMenuItems">
      <template #icon>
        <span
          role="img"
          aria-label="Logzord"
        >🤖</span>
      </template>

      <template #search>
        <div class="relative w-72">
          <Input
            :model-value="filterText"
            type="text"
            placeholder="Filtrar logs..."
            class="!h-7 w-full rounded-full bg-background px-4 py-1.5 pr-10 text-sm text-foreground shadow-inner focus:border-ring focus:ring-ring/50"
            @update:model-value="filterText = String($event)"
          />
          <div class="absolute right-3 top-1/2 -translate-y-1/2 transform text-xs font-mono text-muted-foreground opacity-50">
            /regex/
          </div>
        </div>
      </template>

      <template #actions>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="!h-7 !w-7 rounded-full shadow-md transition-all duration-300 active:scale-95"
                :class="isPlaying ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'"
                :aria-label="isPlaying ? 'Pausar streaming' : 'Iniciar streaming'"
                @click="togglePlay"
              >
                <Pause
                  v-if="isPlaying"
                  :size="14"
                  class="fill-current"
                />
                <Play
                  v-else
                  :size="14"
                  class="fill-current ml-0.5"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ isPlaying ? 'Pausar' : 'Iniciar' }} streaming</p>
            </TooltipContent>
          </Tooltip>

          <div class="flex h-7 items-center rounded-full border border-border bg-secondary p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="!h-6 !w-6 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Retroceder"
            >
              <Rewind :size="13" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="!h-6 !w-6 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Avançar"
            >
              <FastForward :size="13" />
            </Button>
          </div>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="!h-7 !w-7 rounded-full border shadow-sm transition-all duration-300"
                :class="isRecording ? 'bg-destructive/20 text-destructive border-destructive/50 pulse-ring' : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80'"
                :aria-label="isRecording ? 'Parar gravação' : 'Iniciar gravação'"
                @click="toggleRecord"
              >
                <div
                  class="h-2 w-2 rounded-full transition-all duration-300"
                  :class="isRecording ? 'animate-pulse bg-destructive' : 'bg-muted-foreground'"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ isRecording ? 'Parar' : 'Iniciar' }} gravacao no Quadro de Analise</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </template>
    </ShellTitleBar>

    <ShellActivityBar
      v-model:active-id="activeSection"
      :items="views"
    />

    <ShellSidebar :open="activeSection !== null">
      <div class="sidebar__section">
        <div class="sidebar__title">
          {{ activeView.title }}
        </div>
        <component
          :is="activeView.component"
          v-bind="activeViewProps"
          @select-target="selectTarget"
          @request-rotations="requestRotations"
          @add-rotation="addTargetRotation"
          @export-record="exportRecord"
          @clear-record="clearRecord"
        />
      </div>
    </ShellSidebar>

    <div class="main min-h-0">
      <ShellTabs
        :tabs="tabs"
        :active-tab-id="selectedTarget?.id ?? null"
        @update:active-tab-id="activateTab"
        @close="closeTab"
      />

      <div class="editor-area flex min-h-0 flex-1 flex-col !p-0 overflow-hidden">
        <LogViewer
          :filtered-logs="filteredLogs"
          :is-playing="isPlaying"
          :syntax-highlight="syntaxHighlight"
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
