<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()

const teams = ref([{
  label: 'OneVision',
  avatar: {
    text: 'OV',
    alt: 'OneVision'
  }
}, {
  label: 'Operations',
  avatar: {
    text: 'OP',
    alt: 'Operations'
  }
}])
const selectedTeam = ref(teams.value[0])

</script>

<template>
  <UDropdownMenu
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-40' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...selectedTeam,
        label: collapsed ? undefined : selectedTeam?.label,
      }"
      color="neutral"
      variant="ghost"
      :square="collapsed"
      class=""
      :class="[!collapsed && 'py-2']"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />
  </UDropdownMenu>
</template>
