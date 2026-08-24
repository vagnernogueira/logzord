<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ShellTree, type ShellTreeNode } from '@vagnernogueira/vsshellcode/vue'
import type { LogRotation, LogTreeNode, LogTreeTarget } from '@/types'
import { findTargetById, toShellTreeNodes } from '@/lib/logTree'

const props = defineProps<{
  tree: LogTreeNode[]
  selectedTarget: LogTreeTarget | null
  availableRotations: LogRotation[]
  rotationsLoading: boolean
}>()

const emit = defineEmits<{
  'select-target': [target: LogTreeTarget]
  'request-rotations': [target: LogTreeTarget]
  'add-rotation': [target: LogTreeTarget, rotation: LogRotation]
}>()

const shellNodes = computed(() => toShellTreeNodes(props.tree))
const pickerOpen = ref(false)

watch(() => props.selectedTarget?.id, () => {
  pickerOpen.value = false
})

const canShowRotations = computed(() => !!props.selectedTarget && !props.selectedTarget.rotationOf)

function onSelect(node: ShellTreeNode) {
  const target = findTargetById(props.tree, node.id)
  if (target) emit('select-target', target)
}

function openRotationsPicker() {
  if (!props.selectedTarget) return
  pickerOpen.value = !pickerOpen.value
  if (pickerOpen.value) {
    emit('request-rotations', props.selectedTarget)
  }
}

function pickRotation(rotation: LogRotation) {
  if (!props.selectedTarget) return
  emit('add-rotation', props.selectedTarget, rotation)
  pickerOpen.value = false
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 overflow-auto p-2">
      <ShellTree
        :nodes="shellNodes"
        @select="onSelect"
      />
    </div>

    <div
      v-if="canShowRotations"
      class="border-t border-border p-2 text-sm"
    >
      <button
        class="w-full rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-accent"
        type="button"
        data-testid="rotations-toggle"
        @click="openRotationsPicker"
      >
        Ver logs rotacionados de "{{ selectedTarget?.label }}"
      </button>

      <div
        v-if="pickerOpen"
        class="mt-1 space-y-1"
      >
        <p
          v-if="rotationsLoading"
          class="px-3 py-1 text-muted-foreground"
        >
          Carregando...
        </p>
        <p
          v-else-if="availableRotations.length === 0"
          class="px-3 py-1 text-muted-foreground"
        >
          Nenhum arquivo rotacionado disponível.
        </p>
        <button
          v-for="rotation in availableRotations"
          :key="rotation.id"
          class="w-full rounded-md px-3 py-1 text-left hover:bg-accent"
          type="button"
          @click="pickRotation(rotation)"
        >
          {{ rotation.label }}
        </button>
      </div>
    </div>
  </div>
</template>
