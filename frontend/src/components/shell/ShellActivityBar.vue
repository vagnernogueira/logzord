<script setup lang="ts">
interface ActivityItem {
  id: string
  icon: string
  title: string
}

const props = defineProps<{
  items: ActivityItem[]
  activeId: string | null
}>()

const emit = defineEmits<{
  'update:activeId': [id: string | null]
}>()

function select(id: string) {
  emit('update:activeId', id === props.activeId ? null : id)
}
</script>

<template>
  <nav
    class="activity-bar"
    aria-label="Activity Bar"
  >
    <div class="activity-bar__group">
      <button
        v-for="item in items"
        :key="item.id"
        class="activity-bar__item"
        :aria-selected="item.id === activeId"
        :title="item.title"
        @click="select(item.id)"
      >
        <span
          class="codicon"
          :class="`codicon-${item.icon}`"
        />
      </button>
    </div>
  </nav>
</template>
