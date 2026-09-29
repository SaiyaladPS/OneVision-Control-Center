<script setup lang="ts">
import type { ApiResponse } from '~~/server/utils/api-response'

definePageMeta({
  layout: 'default',
  roles: ['ADMIN', 'SUPERUSER']
})

interface AccessUser {
  id: number
  name: string
  username: string
  role: string
}

interface AccessCamera {
  id: number
  host: string
  label: string
  kind: string
  enabled: boolean
}

interface CameraPermission {
  userId: number
  cameraId: number
  canView: boolean
  canScan: boolean
}

interface AccessResponse {
  users: AccessUser[]
  cameras: AccessCamera[]
  permissions: CameraPermission[]
}

interface AccessDraft {
  canView: boolean
  canScan: boolean
}

const { data: response, pending, refresh } = useApi<AccessResponse>('/api/access/cameras')
const { execute: saveAccess, loading: saving } = useApiAction()
const toast = useToast()

const users = computed(() => response.value?.data?.users || [])
const cameras = computed(() => response.value?.data?.cameras || [])
const permissions = computed(() => response.value?.data?.permissions || [])
const selectedUserId = ref<number | undefined>()
const search = ref('')
const draft = reactive<Record<number, AccessDraft>>({})

const userOptions = computed(() => users.value.map(user => ({
  label: `${user.name} (@${user.username})`,
  value: user.id
})))
const selectedUser = computed(() => users.value.find(user => user.id === selectedUserId.value))
const filteredCameras = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return cameras.value
  return cameras.value.filter(camera => `${camera.label} ${camera.host}`.toLowerCase().includes(term))
})
const grantedCount = computed(() => cameras.value.filter(camera => draft[camera.id]?.canView).length)
const scanCount = computed(() => cameras.value.filter(camera => draft[camera.id]?.canScan).length)

function syncDraft() {
  const current = new Map(
    permissions.value
      .filter(permission => permission.userId === selectedUserId.value)
      .map(permission => [permission.cameraId, permission])
  )

  const validCameraIds = new Set(cameras.value.map(camera => camera.id))
  Object.keys(draft).forEach((cameraId) => {
    if (!validCameraIds.has(Number(cameraId))) Reflect.deleteProperty(draft, cameraId)
  })
  cameras.value.forEach((camera) => {
    const permission = current.get(camera.id)
    draft[camera.id] = {
      canView: Boolean(permission?.canView),
      canScan: Boolean(permission?.canScan)
    }
  })
}

watch(users, (value) => {
  const firstUser = value[0]
  if (!selectedUserId.value && firstUser) selectedUserId.value = firstUser.id
}, { immediate: true })
watch([selectedUserId, cameras, permissions], syncDraft, { immediate: true })

function draftFor(cameraId: number) {
  return draft[cameraId] || { canView: false, canScan: false }
}

function setView(cameraId: number, value: boolean) {
  draft[cameraId] = { ...draftFor(cameraId), canView: value, canScan: value && draftFor(cameraId).canScan }
}

function setScan(cameraId: number, value: boolean) {
  draft[cameraId] = { ...draftFor(cameraId), canView: value || draftFor(cameraId).canView, canScan: value }
}

function cameraName(camera: AccessCamera) {
  return camera.label || camera.host
}

function cameraInitial(camera: AccessCamera) {
  return cameraName(camera).slice(0, 1).toUpperCase()
}

function permissionPayload() {
  return cameras.value
    .map(camera => ({ cameraId: camera.id, ...draftFor(camera.id) }))
    .filter(permission => permission.canView || permission.canScan)
}

async function submit() {
  if (!selectedUserId.value) {
    toast.add({ title: 'No user selected', description: 'Select a user before saving access.', color: 'warning' })
    return
  }

  const { error } = await saveAccess(
    () => $fetch<ApiResponse>('/api/access/cameras', {
      method: 'PATCH',
      body: { userId: selectedUserId.value, permissions: permissionPayload() }
    }),
    { successMessage: 'Camera access updated' }
  )
  if (!error) await refresh()
}
</script>

<template>
  <UDashboardPanel id="access-control" grow>
    <template #header>
      <UDashboardNavbar title="Camera access control">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Save access"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!selectedUserId || pending"
            @click="submit"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-7xl space-y-6">
          <UPageCard
            title="Users ↔ CCTV cameras"
            description="Choose a user and control which CCTV cameras they can view and use for scanning. Only administrators can change these permissions."
            icon="i-lucide-shield-check"
            variant="subtle"
          >
            <template #footer>
              <div class="grid w-full gap-3 sm:grid-cols-3">
                <div class="rounded-xl border border-default bg-default/30 p-3">
                  <p class="text-xs text-muted">
                    Selected user
                  </p>
                  <p class="mt-1 truncate font-medium">
                    {{ selectedUser?.name || '—' }}
                  </p>
                </div>
                <div class="rounded-xl border border-default bg-default/30 p-3">
                  <p class="text-xs text-muted">
                    Camera access
                  </p>
                  <p class="mt-1 font-medium">
                    {{ grantedCount }} / {{ cameras.length }} cameras
                  </p>
                </div>
                <div class="rounded-xl border border-default bg-default/30 p-3">
                  <p class="text-xs text-muted">
                    Scan permission
                  </p>
                  <p class="mt-1 font-medium">
                    {{ scanCount }} cameras
                  </p>
                </div>
              </div>
            </template>
          </UPageCard>

          <UPageCard v-if="pending && !response" variant="subtle">
            <div class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="animate-spin" /> Loading access settings…
            </div>
          </UPageCard>

          <UPageCard v-else-if="!users.length" variant="subtle">
            <div class="py-8 text-center">
              <UIcon name="i-lucide-users-round" class="mx-auto size-8 text-muted" />
              <p class="mt-3 font-medium">
                No active users found
              </p>
              <p class="mt-1 text-sm text-muted">
                Create an active user before assigning camera access.
              </p>
            </div>
          </UPageCard>

          <template v-else>
            <div class="grid gap-4 lg:grid-cols-[minmax(220px,0.32fr)_minmax(0,1fr)]">
              <UPageCard
                title="Select user"
                description="Permissions are saved separately for each user."
                variant="subtle"
                class="h-fit"
              >
                <USelect
                  v-model="selectedUserId"
                  :items="userOptions"
                  value-key="value"
                  placeholder="Choose a user"
                  class="w-full"
                />
                <div v-if="selectedUser" class="mt-4 rounded-xl border border-default bg-default/30 p-3 text-sm">
                  <div class="flex items-center gap-3">
                    <UAvatar :alt="selectedUser.name" size="md" />
                    <div class="min-w-0">
                      <p class="truncate font-medium">
                        {{ selectedUser.name }}
                      </p>
                      <p class="truncate text-xs text-muted">
                        @{{ selectedUser.username }} · {{ selectedUser.role }}
                      </p>
                    </div>
                  </div>
                </div>
              </UPageCard>

              <UPageCard variant="subtle" :ui="{ body: 'p-0 sm:p-0' }">
                <template #header>
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 class="font-semibold">
                        Camera permissions
                      </h2>
                      <p class="mt-1 text-sm text-muted">
                        View allows access to the camera; Scan allows plate scanning.
                      </p>
                    </div>
                    <UInput
                      v-model="search"
                      icon="i-lucide-search"
                      placeholder="Search cameras…"
                      class="w-full sm:w-64"
                    />
                  </div>
                </template>

                <div v-if="!filteredCameras.length" class="p-8 text-center text-sm text-muted">
                  No CCTV cameras match your search.
                </div>
                <ul v-else role="list" class="divide-y divide-default">
                  <li v-for="camera in filteredCameras" :key="camera.id" class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div class="flex min-w-0 items-center gap-3">
                      <div class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ring-1 ring-primary/15">
                        {{ cameraInitial(camera) }}
                      </div>
                      <div class="min-w-0">
                        <p class="truncate font-medium">
                          {{ cameraName(camera) }}
                        </p>
                        <p class="truncate text-xs text-muted">
                          {{ camera.host }}
                        </p>
                      </div>
                      <UBadge :label="camera.enabled ? 'Enabled' : 'Disabled'" :color="camera.enabled ? 'success' : 'neutral'" variant="subtle" />
                    </div>

                    <div class="flex shrink-0 flex-wrap items-center gap-4 ps-13 sm:ps-0">
                      <UCheckbox
                        :model-value="draftFor(camera.id).canView"
                        label="View"
                        @update:model-value="setView(camera.id, Boolean($event))"
                      />
                      <UCheckbox
                        :model-value="draftFor(camera.id).canScan"
                        label="Scan"
                        :disabled="!draftFor(camera.id).canView"
                        @update:model-value="setScan(camera.id, Boolean($event))"
                      />
                    </div>
                  </li>
                </ul>
              </UPageCard>
            </div>
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
