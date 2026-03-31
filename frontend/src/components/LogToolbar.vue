<script setup lang="ts">
import { Play, Pause, FastForward, Rewind } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

defineProps<{
  isPlaying: boolean
  isRecording: boolean
  filterText: string
}>()

const emit = defineEmits<{
  'toggle-play': []
  'toggle-record': []
  'update:filterText': [value: string]
}>()
</script>

<template>
  <header class="h-14 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900/80 backdrop-blur-md z-10 sticky top-0">
    <div class="flex items-center space-x-2">
      <!-- Play / Pause -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="rounded-full w-10 h-10 transition-all duration-300 transform active:scale-95 shadow-md"
              :class="isPlaying ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'"
              @click="emit('toggle-play')"
            >
              <Pause
                v-if="isPlaying"
                :size="20"
                class="fill-current"
              />
              <Play
                v-else
                :size="20"
                class="fill-current ml-1"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ isPlaying ? 'Pausar' : 'Iniciar' }} streaming</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <!-- Navigation (Mock) -->
      <div class="flex items-center bg-slate-800 rounded-full p-1 ml-4 border border-slate-700">
        <Button
          variant="ghost"
          size="icon"
          class="p-1.5 h-auto w-auto text-slate-400 hover:text-white rounded-full hover:bg-slate-700"
        >
          <Rewind :size="16" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="p-1.5 h-auto w-auto text-slate-400 hover:text-white rounded-full hover:bg-slate-700"
        >
          <FastForward :size="16" />
        </Button>
      </div>

      <!-- Record -->
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              class="ml-4 rounded-full text-sm font-medium transition-all duration-300 border shadow-sm"
              :class="isRecording ? 'bg-red-500/20 text-red-500 border-red-500/50 pulse-ring' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'"
              @click="emit('toggle-record')"
            >
              <div
                class="w-2.5 h-2.5 rounded-full mr-2 transition-all duration-300"
                :class="isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-500'"
              />
              {{ isRecording ? 'Gravando...' : 'Gravar' }}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ isRecording ? 'Parar' : 'Iniciar' }} gravacao no Quadro de Analise</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <!-- Filter -->
    <div class="relative w-72">
      <Input
        :model-value="filterText"
        type="text"
        placeholder="Filtrar logs..."
        class="bg-slate-950 border-slate-700 text-slate-200 text-sm rounded-full pl-4 pr-10 py-1.5 focus:ring-blue-500/50 focus:border-blue-500 shadow-inner"
        @update:model-value="emit('update:filterText', String($event))"
      />
      <div class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 text-xs font-mono opacity-50">
        /regex/
      </div>
    </div>
  </header>
</template>
