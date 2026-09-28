<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)

const links = [[{
  label: 'Overview',
  icon: 'i-lucide-house',
  to: '/dashboard'
},
{
  label: 'Reports',
  icon: 'i-lucide-file-bar-chart',
  to: '/reports'
},
{
  label: 'Data Registry',
  icon: 'i-lucide-database',
  to: '/data'
}, {
  label: 'Dataset Manager',
  icon: 'i-lucide-panels-top-left',
  to: '/dataset'
}, {
  label: 'CVAT Workspace',
  icon: 'i-lucide-scan-line',
  to: '/cvat-workspace'
}, {
  label: 'Users & Access',
  icon: 'i-lucide-users',
  to: '/users'
}, {
  label: 'CCTV Cameras',
  icon: 'i-lucide-video',
  to: '/settings/cameras'
}], [{
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}, {
  id: 'help',
  label: 'Workspace',
  items: [{
    id: 'status',
    label: 'System status',
    icon: 'i-lucide-activity',
    to: '/dashboard'
  }]
}])

// onMounted(async () => {
//   const cookie = useCookie('cookie-consent')
//   if (cookie.value === 'accepted') {
//     return
//   }

//   toast.add({
//     title: 'We use first-party cookies to enhance your experience on our website.',
//     duration: 0,
//     close: false,
//     actions: [{
//       label: 'Accept',
//       color: 'neutral',
//       variant: 'outline',
//       onClick: () => {
//         cookie.value = 'accepted'
//       }
//     }, {
//       label: 'Opt out',
//       color: 'neutral',
//       variant: 'ghost'
//     }]
//   })
// })
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <div class="mt-auto space-y-2">
          <p v-if="!collapsed" class="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Workspace
          </p>
          <UNavigationMenu
            :collapsed="collapsed"
            :items="links[1]"
            orientation="vertical"
            tooltip
          />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
