<script setup lang="ts">
interface Tab {
  id: string
  label: string
  icon?: string
}

defineProps<{
  tabs: Tab[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  'update:activeTabId': [id: string]
  close: [id: string]
}>()
</script>

<template>
  <div
    class="tabs"
    role="tablist"
  >
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      role="tab"
      :aria-selected="tab.id === activeTabId"
      @click="emit('update:activeTabId', tab.id)"
    >
      <span
        v-if="tab.icon"
        class="codicon"
        :class="`codicon-${tab.icon}`"
      />
      <span>{{ tab.label }}</span>
      <button
        class="tab__close"
        title="Fechar"
        @click.stop="emit('close', tab.id)"
      >
        <span class="codicon codicon-close" />
      </button>
    </div>
  </div>
</template>
