<script setup lang="ts">
defineProps<{
  open: boolean
  title?: string
}>()
</script>

<template>
  <aside
    class="sidebar"
    :hidden="!open"
  >
    <div
      v-if="title"
      class="sidebar__title"
    >
      {{ title }}
    </div>
    <div class="sidebar__section">
      <slot />
    </div>
  </aside>
</template>
