<script setup lang="ts">
const colorMode = useColorMode()

const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Public+Sans:wght@400;500;600&family=Noto+Sans+Lao:wght@400;700&display=swap' }
  ],
  htmlAttrs: {
    lang: 'th'
  }
})

const title = 'OneVision Control Center'
const description = 'ศูนย์กลางรายงานและจัดการข้อมูลของระบบ OneVision พร้อมข้อมูลแบบ Real-time'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterImage: 'https://ui.nuxt.com/assets/templates/nuxt/dashboard-light.png',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <ClientOnly>
      <AppLoading />
    </ClientOnly>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <UToaster />
  </UApp>
</template>
