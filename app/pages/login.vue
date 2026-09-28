<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { encryptPassword } from '~/utils/crypto'

definePageMeta({
  layout: 'auth'
})

const schema = z.object({
  username: z.string().min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
})

type Schema = z.output<typeof schema>

const state = reactive({
  username: '',
  password: ''
})

const loading = ref(false)
const showPassword = ref(false)
const toast = useToast()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  
  try {
    const encryptedBody = {
      ...event.data,
      password: encryptPassword(event.data.password)
    }

    await $fetch('/api/auth/login', {
      method: 'POST',
      body: encryptedBody
    })

    // Sync session state before navigation
    const { fetch } = useUserSession()
    await fetch()

    toast.add({
      title: 'เข้าสู่ระบบสำเร็จ',
      description: 'ยินดีต้อนรับสู่ OneVision Control Center',
      color: 'success'
    })
    
    await navigateTo('/dashboard')
  } catch (err: any) {
    toast.add({
      title: 'เข้าสู่ระบบไม่สำเร็จ',
      description: err.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm">
    <div class="mb-8 flex justify-center">
       <div class="size-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
         <UIcon name="i-lucide-layout-dashboard" class="size-10 text-white" />
       </div>
    </div>

    <UCard class="w-full shadow-xl border-neutral-200/50 dark:border-neutral-800/50 backdrop-blur-sm bg-white/80 dark:bg-neutral-900/80">
      <template #header>
        <div class="flex flex-col items-center gap-2 text-center">
          <div class="mb-1 flex items-center justify-center gap-2"><span class="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">OV</span><span class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">OneVision</span></div>
          <h1 class="text-2xl font-bold tracking-tight">เข้าสู่ระบบ</h1>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            ป้อนข้อมูลเพื่อเข้าสู่ Control Center
          </p>
        </div>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Username" name="username">
          <UInput 
            v-model="state.username" 
            placeholder="Username" 
            icon="i-lucide-user"
            size="lg"
            class="w-full" 
          />
        </UFormField>

        <UFormField label="Password" name="password">
          <template #label>
            <div class="flex items-center justify-between w-full">
              <span>Password</span>
              <NuxtLink to="#" class="text-xs text-primary hover:underline">ลืมรหัสผ่าน?</NuxtLink>
            </div>
          </template>
          <UInput 
            v-model="state.password" 
            :type="showPassword ? 'text' : 'password'" 
            placeholder="••••••••" 
            icon="i-lucide-lock"
            size="lg"
            class="w-full" 
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                class="-me-1"
                @click="showPassword = !showPassword"
              />
            </template>
          </UInput>
        </UFormField>

        <UButton type="submit" block :loading="loading" size="lg" class="mt-6 font-semibold">
          เข้าสู่ระบบ
        </UButton>
      </UForm>

      <template #footer>
        <p class="text-center text-sm text-neutral-500">
          Need help signing in?
          <NuxtLink to="#" class="text-primary font-medium hover:underline">Contact support</NuxtLink>
        </p>
      </template>
    </UCard>
    
    <div class="mt-8 text-center">
      <p class="text-xs text-neutral-400">
        &copy; 2026 OneVision Control Center. All rights reserved.
      </p>
    </div>
  </div>
</template>
