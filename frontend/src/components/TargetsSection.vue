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
  <div class="sidebar__section lz-view">
    <div class="sidebar__title">
      Logs
    </div>
    <div class="lz-view__body">
      <ShellTree
        :nodes="shellNodes"
        @select="onSelect"
      />
    </div>

    <div
      v-if="canShowRotations"
      class="lz-view__footer"
    >
      <button
        class="lz-list__item"
        type="button"
        data-testid="rotations-toggle"
        :aria-expanded="pickerOpen"
        @click="openRotationsPicker"
      >
        <span
          class="codicon"
          :class="pickerOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'"
        />
        <span class="lz-list__label">Ver logs rotacionados de "{{ selectedTarget?.label }}"</span>
      </button>

      <template v-if="pickerOpen">
        <p
          v-if="rotationsLoading"
          class="lz-list__hint"
        >
          Carregando...
        </p>
        <p
          v-else-if="availableRotations.length === 0"
          class="lz-list__hint"
        >
          Nenhum arquivo rotacionado disponível.
        </p>
        <button
          v-for="rotation in availableRotations"
          :key="rotation.id"
          class="lz-list__item lz-list__item--nested"
          type="button"
          @click="pickRotation(rotation)"
        >
          <span class="codicon codicon-history" />
          <span class="lz-list__label">{{ rotation.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
