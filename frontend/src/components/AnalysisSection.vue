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
    <Card class="bg-card/50 border-border backdrop-blur-sm">
      <CardHeader class="p-4 pb-2">
        <CardTitle class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Quadro de Análise
        </CardTitle>
      </CardHeader>
      <CardContent class="px-4 pb-2">
        <p class="text-2xl font-bold text-foreground mb-2">
          {{ recordedCount }} <span class="text-sm font-normal text-muted-foreground">linhas</span>
        </p>
        <p
          v-if="isRecording"
          class="text-xs text-destructive"
        >
          Gravando...
        </p>
      </CardContent>
      <CardFooter class="px-4 pb-4 pt-0 flex space-x-2">
        <Button
          variant="secondary"
          size="sm"
          class="flex-1 text-xs border border-border"
          @click="emit('export-record')"
        >
          Exportar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="flex-1 text-xs border border-destructive/50"
          @click="emit('clear-record')"
        >
          Limpar
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
