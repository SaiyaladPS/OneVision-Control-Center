<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { encryptPassword } from '~/utils/crypto'

const props = defineProps<{
  user?: any // Edit mode if user is provided
  roles?: Array<{ code: string; name?: string }>
  statuses?: Array<{ code: string; name?: string }>
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits(['success', 'close'])

const schema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  name: z.string().min(2, 'Name is too short'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  role: z.string().min(1),
  status: z.string().min(1)
})

type Schema = z.infer<typeof schema>

const state = reactive({
  username: props.user?.username || '',
  name: props.user?.name || '',
  password: '',
  role: props.user?.role || 'USER',
  status: props.user?.status || 'ACTIVE'
})

const { execute: saveUser, loading } = useApiAction()
const showPassword = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const url = props.user ? `/api/users/${props.user.id}` : '/api/users'
  const method = props.user ? 'PATCH' : 'POST'
  
  // If editing, don't send empty password
  const body = { ...state }
  if (props.user && !body.password) {
    delete (body as any).password
  } else if (body.password) {
    // Encrypt password before sending
    body.password = encryptPassword(body.password)
  }

  const { error } = await saveUser(
    () => $fetch(url as any, { method: method as any, body }) as any,
    { successMessage: props.user ? 'ແກ້ໄຂຂໍ້ມູນສຳເລັດ' : 'ສ້າງ User ສຳເລັດ' }
  )

  if (!error) {
    emit('success')
  }
}

// Watch for changes when editing different users
watch(() => props.user, (newVal) => {
  if (newVal) {
    state.username = newVal.username
    state.name = newVal.name
    state.role = newVal.role
    state.status = newVal.status || (newVal.active ? 'ACTIVE' : 'INACTIVE')
    state.password = ''
  } else {
    state.username = ''
    state.name = ''
    state.role = 'USER'
    state.status = 'ACTIVE'
    state.password = ''
  }
}, { immediate: true })
</script>

<template>
  <UModal v-model:open="open" :title="user ? 'Edit User' : 'Create User'" :description="user ? `Editing ${user.name}` : 'Add a new user to the system'">
    <template #content>
      <UForm :schema="schema" :state="state" class="p-6 space-y-4" @submit="onSubmit">
        <h3 class="text-lg font-semibold mb-4">{{ user ? 'Edit User' : 'Create User' }}</h3>
        
        <UFormField label="Username" name="username">
          <UInput v-model="state.username" class="w-full" icon="i-lucide-user-circle" placeholder="username" />
        </UFormField>

        <UFormField label="Name" name="name">
          <UInput v-model="state.name" class="w-full" icon="i-lucide-user" placeholder="Full Name" />
        </UFormField>
        
        <UFormField :label="user ? 'New Password (Optional)' : 'Password'" name="password">
          <UInput 
            v-model="state.password" 
            :type="showPassword ? 'text' : 'password'" 
            class="w-full" 
            icon="i-lucide-lock" 
            placeholder="••••••••" 
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
        
        <UFormField label="Role" name="role">
            <USelect v-model="state.role" :items="(props.roles?.length ? props.roles : [{ code: 'ADMIN' }, { code: 'EDITOR' }, { code: 'USER' }, { code: 'SUPERUSER' }]).map(role => ({ label: role.name || role.code, value: role.code }))" class="w-full" />
        </UFormField>

        <UFormField label="Status" name="status">
            <USelect v-model="state.status" :items="(props.statuses?.length ? props.statuses : [{ code: 'ACTIVE' }, { code: 'INACTIVE' }, { code: 'SUSPENDED' }]).map(status => ({ label: status.name || status.code, value: status.code }))" class="w-full" />
        </UFormField>
        
        <div class="flex justify-end gap-3 pt-6 border-t border-default">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false; $emit('close')" />
          <UButton type="submit" :label="user ? 'Update Data' : 'Save Data'" :loading="loading" icon="i-lucide-save" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
