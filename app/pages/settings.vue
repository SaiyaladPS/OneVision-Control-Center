<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({
  layout: 'default'
})

const links = [[{
  label: 'General',
  icon: 'i-lucide-user',
  to: '/settings',
  exact: true
}, {
  label: 'Members',
  icon: 'i-lucide-users',
  to: '/settings/members'
}, {
  label: 'Notifications',
  icon: 'i-lucide-bell',
  to: '/settings/notifications'
}, {
  label: 'Security',
  icon: 'i-lucide-shield',
  to: '/settings/security'
}, {
  label: 'CVAT',
  icon: 'i-lucide-scan-line',
  to: '/settings/cvat'
}, {
  label: 'CCTV Cameras',
  icon: 'i-lucide-video',
  to: '/settings/cameras'
}], [{
  label: 'Documentation',
  icon: 'i-lucide-book-open',
  to: 'https://ui.nuxt.com/docs/getting-started/installation/nuxt',
  target: '_blank'
}]] satisfies NavigationMenuItem[][]
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="overflow-x-auto">
        <!-- NOTE: The `-mx-1` class is used to align with the `DashboardSidebarCollapse` button here. -->
        <UNavigationMenu :items="links" highlight class="-mx-1 min-w-max flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6 lg:gap-12">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
