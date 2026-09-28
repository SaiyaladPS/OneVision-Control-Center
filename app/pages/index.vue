<script setup lang="ts">
definePageMeta({
  layout: false
})

const { loggedIn } = useUserSession()

onMounted(() => {
  // Check login status after 1s splash
  setTimeout(() => {
    if (loggedIn.value) {
      navigateTo('/dashboard')
    } else {
      navigateTo('/login')
    }
  }, 1000)
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col items-center justify-center bg-white dark:bg-neutral-950 z-[9999]">
    <div class="relative flex items-center justify-center">
      <!-- Outer Ring -->
      <div class="size-20 border-4 border-primary/20 rounded-full animate-pulse"></div>
      <!-- Inner Spinner -->
      <div class="absolute size-20 border-4 border-transparent border-t-primary rounded-full animate-spin"></div>
      <!-- Logo or Icon in center -->
      <span class="absolute flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white shadow-lg shadow-primary/25">OV</span>
    </div>
    
    <div class="mt-8 flex flex-col items-center gap-2 text-center font-sans">
      <h2 class="text-xl font-semibold tracking-tight animate-pulse">กำลังเตรียม OneVision Control Center...</h2>
      <p class="text-sm text-neutral-500 dark:text-neutral-400">กำลังโหลดข้อมูลและการเชื่อมต่อ</p>
    </div>

    <!-- Background Decoration -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 size-[500px] bg-primary/5 rounded-full blur-3xl opacity-50 pulse-bg animate-pulse"></div>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pulse-bg {
  animation: pulse-bg 4s ease-in-out infinite;
}

@keyframes pulse-bg {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.5; }
}

</style>
