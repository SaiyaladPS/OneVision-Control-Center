<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ApiResponse } from '~~/server/utils/api-response'

definePageMeta({ layout: 'default' })

interface Camera {
  id: number
  host: string
  label: string
  kind: string
  deviceIndex: number | null
  enabled: boolean
  streamUrl: string
  hasCredentials: boolean
  updatedAt: string
}

const cameraSchema = z.object({
  label: z.string().trim().max(80, 'Camera name must be 80 characters or fewer').or(z.literal('')),
  host: z.string()
    .trim()
    .min(1, 'Host or IP address is required')
    .max(255, 'Host or IP address is too long')
    .refine(value => !/[\s/]/.test(value), 'Enter a valid host or IP address'),
  streamUrl: z.string()
    .trim()
    .refine(value => !value || /^(rtsp|rtsps|https?|local):\/\//i.test(value), 'Use an RTSP, HTTP, HTTPS, or local URL'),
  username: z.string().trim().max(100, 'Username is too long').or(z.literal('')),
  password: z.string().max(200, 'Password is too long').or(z.literal('')),
  kind: z.enum(['ip', 'local']),
  deviceIndex: z.string().refine(value => value === '' || /^(?:0|[1-9]\d?)$/.test(value), 'Use a whole number from 0 to 99'),
  enabled: z.boolean()
})

type CameraForm = z.output<typeof cameraSchema>

const emptyForm = (): CameraForm => ({
  host: '',
  label: '',
  streamUrl: '',
  username: '',
  password: '',
  kind: 'ip',
  deviceIndex: '',
  enabled: true
})

const { data: response, pending, refresh } = useApi<Camera[]>('/api/cameras')
const cameras = computed(() => response.value?.data || [])
const query = ref('')
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all')
const modalOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<CameraForm>(emptyForm())
const { execute: saveCamera, loading: saving } = useApiAction()
const { execute: deleteCamera, loading: deleting } = useApiAction()

const enabledCount = computed(() => cameras.value.filter(camera => camera.enabled).length)
const credentialCount = computed(() => cameras.value.filter(camera => camera.hasCredentials).length)
const filteredCameras = computed(() => {
  const term = query.value.trim().toLowerCase()

  return cameras.value.filter((camera) => {
    const matchesTerm = !term || [camera.label, camera.host, camera.streamUrl]
      .some(value => String(value || '').toLowerCase().includes(term))
    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'enabled' ? camera.enabled : !camera.enabled)

    return matchesTerm && matchesStatus
  })
})

const cameraName = (camera: Camera, index: number) => camera.label || `Camera ${String(index + 1).padStart(2, '0')}`
const cameraInitial = (camera: Camera, index: number) => (camera.label?.trim()?.charAt(0) || String(index + 1)).toUpperCase()

function clearFilters() {
  query.value = ''
  statusFilter.value = 'all'
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  modalOpen.value = true
}

function openEdit(camera: Camera) {
  editingId.value = camera.id
  Object.assign(form, {
    host: camera.host,
    label: camera.label,
    streamUrl: camera.streamUrl,
    username: '',
    password: '',
    kind: camera.kind || 'ip',
    deviceIndex: camera.deviceIndex == null ? '' : String(camera.deviceIndex),
    enabled: camera.enabled
  })
  modalOpen.value = true
}

async function submitForm(event: FormSubmitEvent<CameraForm>) {
  const body: Record<string, unknown> = { ...event.data }
  if (editingId.value && !form.username.trim()) delete body.username
  if (editingId.value && !form.password) delete body.password
  const url = editingId.value ? `/api/cameras/${editingId.value}` : '/api/cameras'
  const { error } = await saveCamera(
    () => $fetch<ApiResponse<Camera>>(url, { method: editingId.value ? 'PATCH' : 'POST', body }),
    { successMessage: editingId.value ? 'CCTV camera updated.' : 'CCTV camera added.' }
  )
  if (!error) {
    modalOpen.value = false
    await refresh()
  }
}

async function removeCamera(camera: Camera) {
  if (!window.confirm(`Delete CCTV camera “${camera.label || camera.host}”?`)) return
  const { error } = await deleteCamera(
    () => $fetch<ApiResponse<{ id: number }>>(`/api/cameras/${camera.id}`, { method: 'DELETE' }),
    { successMessage: 'CCTV camera deleted.' }
  )
  if (!error) await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <div class="relative overflow-hidden rounded-2xl border border-default bg-gradient-to-br from-primary/15 via-elevated to-default p-5 sm:p-6">
      <div class="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-primary/10 blur-3xl" />
      <div class="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex min-w-0 items-start gap-4">
          <div class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <UIcon name="i-lucide-video" class="size-6" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl font-semibold tracking-tight">
                CCTV Cameras
              </h1>
              <UBadge label="Database synced" color="primary" variant="subtle" />
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Manage the CCTV settings shared with Car Scan. Credentials are stored securely in the database and never shown here.
            </p>
          </div>
        </div>
        <UButton
          label="Add camera"
          icon="i-lucide-plus"
          size="lg"
          class="shrink-0"
          @click="openCreate"
        />
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <UPageCard variant="subtle" class="border-default/80">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-muted">
              Total cameras
            </p>
            <p class="mt-1 text-2xl font-semibold tracking-tight">
              {{ cameras.length }}
            </p>
          </div>
          <div class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <UIcon name="i-lucide-video" class="size-5" />
          </div>
        </div>
      </UPageCard>
      <UPageCard variant="subtle" class="border-default/80">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-muted">
              Enabled
            </p>
            <p class="mt-1 text-2xl font-semibold tracking-tight">
              {{ enabledCount }}
            </p>
          </div>
          <div class="grid size-10 place-items-center rounded-xl bg-success/10 text-success">
            <UIcon name="i-lucide-circle-check" class="size-5" />
          </div>
        </div>
      </UPageCard>
      <UPageCard variant="subtle" class="border-default/80">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-muted">
              Credentials saved
            </p>
            <p class="mt-1 text-2xl font-semibold tracking-tight">
              {{ credentialCount }}
            </p>
          </div>
          <div class="grid size-10 place-items-center rounded-xl bg-info/10 text-info">
            <UIcon name="i-lucide-lock-keyhole" class="size-5" />
          </div>
        </div>
      </UPageCard>
      <UPageCard variant="subtle" class="border-default/80">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-muted">
              Showing
            </p>
            <p class="mt-1 text-2xl font-semibold tracking-tight">
              {{ filteredCameras.length }}
            </p>
          </div>
          <div class="grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
            <UIcon name="i-lucide-list-filter" class="size-5" />
          </div>
        </div>
      </UPageCard>
    </div>

    <UPageCard v-if="pending && !response" variant="subtle">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="animate-spin" /> Loading CCTV cameras…
      </div>
    </UPageCard>

    <UPageCard v-else-if="!cameras.length" variant="subtle">
      <div class="py-8 text-center">
        <UIcon name="i-lucide-video" class="mx-auto size-8 text-muted" />
        <p class="mt-3 font-medium">
          No CCTV cameras configured
        </p>
        <p class="mt-1 text-sm text-muted">
          Add a camera to make it available to the shared Car Scan camera list.
        </p>
        <UButton
          class="mt-4"
          label="Add camera"
          icon="i-lucide-plus"
          @click="openCreate"
        />
      </div>
    </UPageCard>

    <template v-else-if="cameras.length">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">
            Camera registry
          </h2>
          <p class="mt-1 text-sm text-muted">
            Search and manage the cameras available to Car Scan.
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="Search cameras..."
            class="w-full sm:w-64"
          />
          <USelect
            v-model="statusFilter"
            :items="[
              { label: 'All cameras', value: 'all' },
              { label: 'Enabled only', value: 'enabled' },
              { label: 'Disabled only', value: 'disabled' }
            ]"
            class="w-full sm:w-40"
          />
        </div>
      </div>

      <UPageCard v-if="!filteredCameras.length" variant="subtle">
        <div class="py-8 text-center">
          <UIcon name="i-lucide-search-x" class="mx-auto size-8 text-muted" />
          <p class="mt-3 font-medium">
            No cameras match your filters
          </p>
          <p class="mt-1 text-sm text-muted">
            Try another search term or reset the status filter.
          </p>
          <UButton
            class="mt-4"
            label="Clear filters"
            color="neutral"
            variant="outline"
            @click="clearFilters"
          />
        </div>
      </UPageCard>

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="(camera, index) in filteredCameras"
          :key="camera.id"
          variant="subtle"
          class="group relative overflow-hidden border-default/80 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <div class="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 font-semibold text-primary ring-1 ring-primary/15">
                {{ cameraInitial(camera, index) }}
              </div>
              <div class="min-w-0">
                <h2 class="truncate font-semibold" :title="cameraName(camera, index)">
                  {{ cameraName(camera, index) }}
                </h2>
                <p class="mt-1 truncate text-xs text-muted" :title="camera.host">
                  {{ camera.host }}
                </p>
              </div>
            </div>
            <UBadge :label="camera.enabled ? 'Enabled' : 'Disabled'" :color="camera.enabled ? 'success' : 'neutral'" variant="subtle" />
          </div>

          <div class="mt-5 space-y-3">
            <div class="flex items-center justify-between gap-3 text-xs text-muted">
              <span class="flex items-center gap-1.5"><UIcon name="i-lucide-radio" /> Stream endpoint</span>
              <span v-if="camera.hasCredentials" class="flex items-center gap-1 text-primary"><UIcon name="i-lucide-shield-check" /> Secure</span>
            </div>
            <p class="truncate rounded-lg border border-default bg-default/30 px-3 py-2 font-mono text-[11px] text-muted" :title="camera.streamUrl">
              {{ camera.streamUrl || 'No stream URL' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge :label="camera.kind === 'local' ? 'Local camera' : 'IP camera'" color="neutral" variant="subtle" />
              <UBadge
                v-if="camera.deviceIndex !== null"
                :label="`Device ${camera.deviceIndex}`"
                color="neutral"
                variant="subtle"
              />
              <UBadge
                v-if="camera.hasCredentials"
                label="Credentials saved"
                color="primary"
                variant="subtle"
              />
            </div>
          </div>

          <div class="mt-5 flex items-center justify-between gap-3 border-t border-default pt-3">
            <span class="text-xs text-muted">{{ camera.enabled ? 'Ready for Car Scan' : 'Disabled' }}</span>
            <div class="flex items-center gap-1">
              <UButton
                aria-label="Edit camera"
                title="Edit camera"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                @click="openEdit(camera)"
              />
              <UButton
                aria-label="Delete camera"
                title="Delete camera"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                :loading="deleting"
                @click="removeCamera(camera)"
              />
            </div>
          </div>
        </UPageCard>
      </div>
    </template>

    <UModal
      v-model:open="modalOpen"
      :title="editingId ? 'Edit CCTV camera' : 'Add CCTV camera'"
      :description="editingId ? 'Update the camera settings. Leave username and password blank to keep saved credentials.' : 'Save a CCTV camera for the shared Car Scan camera list.'"
      :ui="{ content: 'w-[calc(100vw-2rem)] sm:max-w-3xl' }"
    >
      <template #body>
        <UForm
          id="camera-form"
          :schema="cameraSchema"
          :state="form"
          class="space-y-5"
          @submit="submitForm"
        >
          <div class="rounded-2xl border border-default bg-elevated/20 p-4 sm:p-5">
            <div class="mb-4 flex items-start gap-3">
              <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-settings-2" class="size-4" />
              </div>
              <div>
                <p class="font-medium">
                  Camera identity
                </p>
                <p class="mt-1 text-xs leading-5 text-muted">
                  Give this camera a recognizable name and network address.
                </p>
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Camera name" name="label">
                <UInput
                  v-model="form.label"
                  icon="i-lucide-tag"
                  placeholder="Gate camera 01"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Host / IP address" name="host" required>
                <UInput
                  v-model="form.host"
                  icon="i-lucide-globe-2"
                  :disabled="Boolean(editingId)"
                  placeholder="192.168.100.50"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <div class="rounded-2xl border border-default bg-elevated/20 p-4 sm:p-5">
            <div class="mb-4 flex items-start gap-3">
              <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
                <UIcon name="i-lucide-radio-tower" class="size-4" />
              </div>
              <div>
                <p class="font-medium">
                  Stream connection
                </p>
                <p class="mt-1 text-xs leading-5 text-muted">
                  Use the camera RTSP endpoint or leave it blank for the default path.
                </p>
              </div>
            </div>
            <UFormField label="RTSP / stream URL" name="streamUrl">
              <UInput
                v-model="form.streamUrl"
                icon="i-lucide-link"
                placeholder="rtsp://192.168.100.50:554/Streaming/Channels/101"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="rounded-2xl border border-default bg-elevated/20 p-4 sm:p-5">
            <div class="mb-4 flex items-start gap-3">
              <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
                <UIcon name="i-lucide-shield-check" class="size-4" />
              </div>
              <div>
                <p class="font-medium">
                  Authentication
                </p>
                <p class="mt-1 text-xs leading-5 text-muted">
                  Credentials are saved securely and are never returned to the browser.
                </p>
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Camera username" name="username">
                <UInput
                  v-model="form.username"
                  icon="i-lucide-user-round"
                  autocomplete="off"
                  placeholder="admin"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Camera password"
                name="password"
                :description="editingId ? 'Leave blank to keep the current password.' : 'Optional if authentication is not required.'"
              >
                <UInput
                  v-model="form.password"
                  icon="i-lucide-key-round"
                  type="password"
                  autocomplete="new-password"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Camera type" name="kind">
              <USelect
                v-model="form.kind"
                :items="[{ label: 'IP camera', value: 'ip' }, { label: 'Local camera', value: 'local' }]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Device index" name="deviceIndex" description="Used for local cameras, usually 0.">
              <UInput
                v-model="form.deviceIndex"
                type="number"
                min="0"
                max="99"
                placeholder="0"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="flex items-center justify-between gap-4 rounded-xl border border-default bg-elevated/20 px-4 py-3">
            <div>
              <p class="text-sm font-medium">
                Camera is enabled
              </p>
              <p class="mt-1 text-xs text-muted">
                Allow Car Scan to use this camera.
              </p>
            </div>
            <UCheckbox v-model="form.enabled" name="enabled" />
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-default pt-5 sm:flex-row sm:justify-end">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              class="w-full sm:w-auto"
              @click="modalOpen = false"
            />
            <UButton
              :label="editingId ? 'Save changes' : 'Add camera'"
              icon="i-lucide-save"
              type="submit"
              class="w-full sm:w-auto"
              :loading="saving"
            />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
