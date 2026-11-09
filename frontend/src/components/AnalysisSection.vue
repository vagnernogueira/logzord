<script setup lang="ts">
defineProps<{
  recordedCount: number
  isRecording: boolean
  recordError?: string | null
}>()

const emit = defineEmits<{
  'export-record': []
  'clear-record': []
}>()
</script>

<template>
  <div class="sidebar__section lz-view">
    <div class="sidebar__title">
      Análise
    </div>
    <div class="lz-analysis">
      <div class="lz-analysis__header">
        Quadro de Análise
      </div>
      <div class="lz-analysis__count">
        <vscode-badge>{{ recordedCount }}</vscode-badge>
        <span>linhas</span>
        <span
          v-if="isRecording"
          class="lz-analysis__recording"
        >
          <span class="codicon codicon-record" />
          Gravando...
        </span>
      </div>
      <div
        v-if="recordError"
        class="lz-analysis__error"
        role="alert"
      >
        <span class="codicon codicon-error" />
        Falha ao gravar: {{ recordError }}
      </div>
      <div class="lz-analysis__actions">
        <vscode-button @click="emit('export-record')">
          <span class="codicon codicon-export" />
          Exportar
        </vscode-button>
        <vscode-button
          secondary
          @click="emit('clear-record')"
        >
          <span class="codicon codicon-clear-all" />
          Limpar
        </vscode-button>
      </div>
    </div>
  </div>
</template>
