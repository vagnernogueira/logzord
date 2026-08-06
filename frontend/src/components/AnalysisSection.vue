<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'

defineProps<{
  recordedCount: number
  isRecording: boolean
}>()

const emit = defineEmits<{
  'export-record': []
  'clear-record': []
}>()
</script>

<template>
  <div class="p-2">
    <Card class="bg-slate-800/50 border-slate-700 backdrop-blur-sm">
      <CardHeader class="p-4 pb-2">
        <CardTitle class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Quadro de Análise
        </CardTitle>
      </CardHeader>
      <CardContent class="px-4 pb-2">
        <p class="text-2xl font-bold text-white mb-2">
          {{ recordedCount }} <span class="text-sm font-normal text-slate-500">linhas</span>
        </p>
        <p
          v-if="isRecording"
          class="text-xs text-red-400"
        >
          Gravando...
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
  </div>
</template>
