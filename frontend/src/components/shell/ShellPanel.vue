<script setup lang="ts">
defineProps<{
  open: boolean
}>()
</script>

<template>
  <div
    class="panel"
    :hidden="!open"
  >
    <slot />
  </div>
</template>
