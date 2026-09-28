<script setup lang="ts">
import type { ApiResponse } from '~~/server/utils/api-response'

definePageMeta({ layout: 'default' })

interface CvatConnection {
  id: number
  name: string
  baseUrl: string
  organization: string | null
  projectId: string | null
  taskId: string | null
  isDefault: boolean
  hasAccessToken: boolean
}

const emptyForm = () => ({
  name: '',
  baseUrl: '',
  organization: '',
  projectId: '',
  taskId: '',
  accessToken: '',
  isDefault: false
})

const { data: response, pending, refresh } = useApi<CvatConnection[]>('/api/cvat/connections')
const connections = computed(() => response.value?.data || [])
const modalOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive(emptyForm())
const { execute: saveConnection, loading: saving } = useApiAction()
const { execute: deleteConnection, loading: deleting } = useApiAction()

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  form.isDefault = connections.value.length === 0
  modalOpen.value = true
}

function openEdit(connection: CvatConnection) {
  editingId.value = connection.id
  Object.assign(form, {
    name: connection.name,
    baseUrl: connection.baseUrl,
    organization: connection.organization || '',
    projectId: connection.projectId || '',
    taskId: connection.taskId || '',
    accessToken: '',
    isDefault: connection.isDefault
  })
  modalOpen.value = true
}

async function submitForm() {
  if (!form.name.trim() || !form.baseUrl.trim() || (!editingId.value && !form.accessToken.trim())) return
  const body = { ...form }
  const url = editingId.value ? `/api/cvat/connections/${editingId.value}` : '/api/cvat/connections'
  const { error } = await saveConnection(
    () => $fetch<ApiResponse<CvatConnection>>(url, { method: editingId.value ? 'PATCH' : 'POST', body }),
    { successMessage: editingId.value ? 'CVAT connection updated.' : 'CVAT connection added.' }
  )
  if (!error) {
    modalOpen.value = false
    await refresh()
  }
}

async function removeConnection(connection: CvatConnection) {
  if (!window.confirm(`Delete CVAT connection “${connection.name}”?`)) return
  const { error } = await deleteConnection(
    () => $fetch<ApiResponse<{ id: number }>>(`/api/cvat/connections/${connection.id}`, { method: 'DELETE' }),
    { successMessage: 'CVAT connection deleted.' }
  )
  if (!error) await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-xl font-semibold">
          CVAT connections
        </h1>
        <p class="mt-1 text-sm text-muted">
          Manage CVAT servers and their project or task details.
        </p>
      </div>
      <UButton label="Add connection" icon="i-lucide-plus" @click="openCreate" />
    </div>

    <UPageCard v-if="pending && !response" variant="subtle">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="animate-spin" /> Loading CVAT connections…
      </div>
    </UPageCard>
    <UPageCard v-else-if="!connections.length" variant="subtle">
      <div class="py-8 text-center">
        <UIcon name="i-lucide-scan-line" class="mx-auto size-8 text-muted" />
        <p class="mt-3 font-medium">
          No CVAT connections yet
        </p>
        <p class="mt-1 text-sm text-muted">
          Add a server connection to save its URL and project configuration.
        </p>
        <UButton
          class="mt-4"
          label="Add CVAT connection"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>
    </UPageCard>
    <div v-else class="space-y-3">
      <UPageCard v-for="connection in connections" :key="connection.id" variant="subtle">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-semibold">
                {{ connection.name }}
              </h2>
              <UBadge
                v-if="connection.isDefault"
                label="Default"
                color="primary"
                variant="subtle"
              />
              <UBadge :label="connection.hasAccessToken ? 'Token saved' : 'Token missing'" :color="connection.hasAccessToken ? 'success' : 'warning'" variant="subtle" />
            </div>
            <a
              :href="connection.baseUrl"
              target="_blank"
              rel="noreferrer"
              class="block truncate text-sm text-primary hover:underline"
            >{{ connection.baseUrl }}</a>
            <p class="text-xs text-muted">
              <span v-if="connection.organization">Organization: {{ connection.organization }}</span>
              <span v-if="connection.projectId">{{ connection.organization ? ' · ' : '' }}Project: {{ connection.projectId }}</span>
              <span v-if="connection.taskId"> · Task: {{ connection.taskId }}</span>
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <UButton
              label="Edit"
              icon="i-lucide-pencil"
              color="neutral"
              variant="outline"
              @click="openEdit(connection)"
            />
            <UButton
              aria-label="Delete connection"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              :loading="deleting"
              @click="removeConnection(connection)"
            />
          </div>
        </div>
      </UPageCard>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit CVAT connection' : 'Add CVAT connection'" :description="editingId ? 'Update the server details. Leave the token blank to keep the current token.' : 'Store a CVAT server and API token for this workspace.'">
      <template #body>
        <form class="space-y-4" @submit.prevent="submitForm">
          <UFormField label="Connection name" required>
            <UInput v-model="form.name" placeholder="Production CVAT" class="w-full" />
          </UFormField>
          <UFormField label="CVAT server URL" required>
            <UInput
              v-model="form.baseUrl"
              type="url"
              placeholder="https://cvat.example.com"
              class="w-full"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Organization">
              <UInput v-model="form.organization" placeholder="Organization slug" class="w-full" />
            </UFormField>
            <UFormField label="Project ID">
              <UInput v-model="form.projectId" placeholder="Optional" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Task ID">
            <UInput v-model="form.taskId" placeholder="Optional" class="w-full" />
          </UFormField>
          <UFormField :label="editingId ? 'Replace API token (optional)' : 'API token'" :required="!editingId" description="Token is encrypted before it is stored and is never returned to the browser.">
            <UInput
              v-model="form.accessToken"
              type="password"
              autocomplete="new-password"
              :placeholder="editingId ? 'Leave blank to keep current token' : 'Paste CVAT API token'"
              class="w-full"
            />
          </UFormField>
          <UCheckbox v-model="form.isDefault" label="Use as the default CVAT connection" />
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="modalOpen = false"
            />
            <UButton
              :label="editingId ? 'Save changes' : 'Add connection'"
              icon="i-lucide-save"
              type="submit"
              :loading="saving"
              :disabled="!form.name.trim() || !form.baseUrl.trim() || (!editingId && !form.accessToken.trim())"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
