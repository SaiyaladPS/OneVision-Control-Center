<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { t } = useAppLocale()

const links = computed(() => [[{
  label: t('nav.overview'),
  icon: 'i-lucide-house',
  to: '/dashboard'
},
{
  label: t('nav.reports'),
  icon: 'i-lucide-file-bar-chart',
  to: '/reports'
},
{
  label: t('nav.data'),
  icon: 'i-lucide-database',
  to: '/data'
}, {
  label: t('nav.dataset'),
  icon: 'i-lucide-panels-top-left',
  to: '/dataset'
}, {
  label: t('nav.cvat'),
  icon: 'i-lucide-scan-line',
  to: '/cvat-workspace'
}, {
  label: t('nav.users'),
  icon: 'i-lucide-users',
  to: '/users'
}, {
  label: t('nav.cameras'),
  icon: 'i-lucide-video',
  to: '/settings/cameras'
}, {
  label: t('nav.access'),
  icon: 'i-lucide-shield-check',
  to: '/access-control'
}], [{
  label: t('nav.settings'),
  icon: 'i-lucide-settings',
  to: '/settings'
}]] satisfies NavigationMenuItem[][])

const groups = computed(() => [{
  id: 'links',
  label: t('nav.goTo'),
  items: links.value.flat()
}, {
  id: 'help',
  label: t('nav.workspace'),
  items: [{
    id: 'status',
    label: t('nav.systemStatus'),
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
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" :label="t('nav.search')" />

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
        <LanguageSwitcher :collapsed="collapsed" />
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
