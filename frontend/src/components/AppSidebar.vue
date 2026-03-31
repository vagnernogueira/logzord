<script setup lang="ts">
import type { Target } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

defineProps<{
  targets: Target[]
  selectedTarget: Target | null
  recordedCount: number
  isRecording: boolean
}>()

const emit = defineEmits<{
  'select-target': [target: Target]
  'export-record': []
  'clear-record': []
  'toggle-record': []
}>()
</script>

<template>
  <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
    <!-- Logo -->
    <div class="p-4 border-b border-slate-800 flex items-center space-x-2">
      <div class="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg glow">
        🤖
      </div>
      <h1 class="text-xl font-bold text-white tracking-widest">
        LogZord
      </h1>
    </div>

    <!-- Target List -->
    <div class="p-4 flex-1 overflow-y-auto">
      <h2 class="text-xs uppercase text-slate-500 font-semibold mb-3 tracking-wider">
        Targets
      </h2>
      <ul class="space-y-1">
        <li
          v-for="target in targets"
          :key="target.id"
        >
          <button
            class="w-full text-left px-3 py-2 rounded-md transition-all duration-200 text-sm flex items-center shadow-sm"
            :class="selectedTarget?.id === target.id ? 'bg-blue-600 text-white shadow-blue-500/20 shadow-lg font-medium' : 'hover:bg-slate-800 text-slate-400'"
            @click="emit('select-target', target)"
          >
            <div
              class="w-2 h-2 rounded-full mr-2"
              :class="selectedTarget?.id === target.id ? 'bg-white' : 'bg-slate-600'"
            />
            {{ target.name }}
          </button>
        </li>
      </ul>
    </div>

    <Separator orientation="horizontal" class="bg-slate-800" />

    <!-- Analysis Board -->
    <Card class="m-4 bg-slate-800/50 border-slate-700 backdrop-blur-sm">
      <CardHeader class="p-4 pb-2">
        <CardTitle class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Quadro de Análise
        </CardTitle>
      </CardHeader>
      <CardContent class="px-4 pb-2">
        <p class="text-2xl font-bold text-white mb-2">
          {{ recordedCount }} <span class="text-sm font-normal text-slate-500">linhas</span>
        </p>
      </CardContent>
      <CardFooter class="px-4 pb-4 pt-0 flex space-x-2">
        <Button
          variant="secondary"
          size="sm"
          class="flex-1 bg-slate-700 hover:bg-slate-600 text-xs border border-slate-600"
          @click="emit('export-record')"
        >
          Exportar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="flex-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 text-xs border border-red-900/50"
          @click="emit('clear-record')"
        >
          Limpar
        </Button>
      </CardFooter>
    </Card>
  </aside>
</template>
