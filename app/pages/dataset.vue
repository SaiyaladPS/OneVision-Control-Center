<script setup lang="ts">
definePageMeta({ layout: 'default' })

type DatasetStatus = 'PASS' | 'REVIEW' | 'REJECT'

interface DatasetRecord {
  id: string
  date: string
  filename: string
  country: 'thai' | 'laos'
  status: DatasetStatus
  plateText: string
  platePrefix: string
  plateNumber: string
  province: string
  confidence: number
  qcReasons: string[]
  sourceImage: string
  sourceExists: boolean
  labelReady: boolean
  box: number[] | null
  imageWidth: number | null
  imageHeight: number | null
  cropWidth: number | null
  cropHeight: number | null
  ocrWidth: number | null
  ocrHeight: number | null
  ocrImageExists: boolean
  tokenBoxes: Array<{ label: string, kind: string, confidence: number, box: number[] }>
  fileSize: number
  updatedAt: string
}

interface DatasetPayload {
  root: string
  items: DatasetRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  dates: string[]
  stats: { total: number, exportable: number, pass: number, review: number, reject: number, missingImages: number }
}

interface DatasetDeleteResponse {
  success: boolean
  message?: string
  data?: { deletedRecords: number, deletedFiles: number, missing: string[] }
}

interface DatasetUpdateResponse {
  success: boolean
  message?: string
  data?: { id: string, country: 'thai' | 'laos', province: string, platePrefix: string, plateNumber: string, status: DatasetStatus, box: number[] | null }
}

const toast = useToast()
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const selectedDate = ref('all')
const selectedCountry = ref('all')
const selectedStatus = ref('all')
const selectedIds = ref<string[]>([])
const selectedRecord = ref<DatasetRecord | null>(null)
const detailOpen = ref(false)
const previewOpen = ref(false)
const previewVariant = ref<'full' | 'crop' | 'boxes'>('full')
const exporting = ref(false)
const deleteConfirmOpen = ref(false)
const deleteTarget = ref<{ ids: string[], type: 'single' | 'bulk' } | null>(null)
const editing = ref(false)
const editForm = reactive({
  country: 'thai' as 'thai' | 'laos',
  province: '',
  platePrefix: '',
  plateNumber: '',
  status: 'REVIEW' as DatasetStatus,
  box: [0, 0, 0, 0]
})
const { execute: deleteDataset, loading: deleting } = useApiAction()
const { execute: updateDataset, loading: saving } = useApiAction()

const { data: response, pending, refresh } = useApi<DatasetPayload>(() => {
  const params = new URLSearchParams({
    page: String(page.value),
    pageSize: String(pageSize.value),
    date: selectedDate.value,
    country: selectedCountry.value,
    status: selectedStatus.value,
    search: search.value
  })
  return `/api/dataset?${params.toString()}`
})

const dataset = computed(() => response.value?.data)
const records = computed(() => dataset.value?.items || [])
const stats = computed(() => dataset.value?.stats || { total: 0, exportable: 0, pass: 0, review: 0, reject: 0, missingImages: 0 })
const pageIds = computed(() => records.value.map(record => record.id))
const selectedOnPage = computed(() => pageIds.value.filter(id => selectedIds.value.includes(id)).length)
const allPageSelected = computed(() => pageIds.value.length > 0 && selectedOnPage.value === pageIds.value.length)

watch([pageSize, selectedDate, selectedCountry, selectedStatus], () => {
  page.value = 1
  selectedIds.value = []
  refresh()
})
watch(page, () => refresh())

function togglePageSelection() {
  if (allPageSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !pageIds.value.includes(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...pageIds.value])]
  }
}

function toggleRecord(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id]
}

function statusColor(status: DatasetStatus) {
  return status === 'PASS' ? 'success' as const : status === 'REJECT' ? 'error' as const : 'warning' as const
}

function formatDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
}

function formatBytes(value: number) {
  if (!value) return '—'
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function openDetail(record: DatasetRecord) {
  selectedRecord.value = record
  editing.value = false
  detailOpen.value = true
}

function startEdit(record: DatasetRecord) {
  selectedRecord.value = record
  Object.assign(editForm, {
    country: record.country,
    province: record.province,
    platePrefix: record.platePrefix,
    plateNumber: record.plateNumber,
    status: record.status,
    box: record.box ? [...record.box] : [0, 0, 0, 0]
  })
  editing.value = true
  detailOpen.value = true
}

async function saveEdit() {
  const record = selectedRecord.value
  if (!record) return
  const { error } = await updateDataset(
    () => $fetch<DatasetUpdateResponse>('/api/dataset', {
      method: 'PATCH',
      body: {
        id: record.id,
        changes: {
          country: editForm.country,
          province: editForm.province,
          platePrefix: editForm.platePrefix,
          plateNumber: editForm.plateNumber,
          status: editForm.status,
          box: editForm.box.some(value => value !== 0) ? editForm.box.map(Number) : null
        }
      }
    }),
    { successMessage: 'CVAT annotation and database record updated.' }
  )
  if (!error) {
    editing.value = false
    await refresh()
    selectedRecord.value = records.value.find(item => item.id === record.id) || null
  }
}

function openImagePreview(record: DatasetRecord, variant: 'full' | 'crop' | 'boxes') {
  selectedRecord.value = record
  previewVariant.value = variant
  previewOpen.value = true
}

function previewAspectRatio(record: DatasetRecord, variant: 'full' | 'crop' | 'boxes') {
  if (variant === 'full' && record.imageWidth && record.imageHeight) {
    return `${record.imageWidth} / ${record.imageHeight}`
  }
  if (record.cropWidth && record.cropHeight) {
    return `${record.cropWidth} / ${record.cropHeight}`
  }
  return '16 / 9'
}

function imageUrl(record: DatasetRecord, variant: 'full' | 'crop' | 'ocr' = 'full') {
  const params = new URLSearchParams({ id: record.id, variant })
  return `/api/dataset/image?${params.toString()}`
}

function boundingBoxStyle(record: DatasetRecord) {
  if (!record.box || !record.imageWidth || !record.imageHeight) {
    return { left: '3%', top: '3%', width: '94%', height: '94%' }
  }
  const [left = 0, top = 0, right = record.imageWidth, bottom = record.imageHeight] = record.box
  return {
    left: `${Math.max(0, Math.min(100, left / record.imageWidth * 100))}%`,
    top: `${Math.max(0, Math.min(100, top / record.imageHeight * 100))}%`,
    width: `${Math.max(0, Math.min(100, (right - left) / record.imageWidth * 100))}%`,
    height: `${Math.max(0, Math.min(100, (bottom - top) / record.imageHeight * 100))}%`
  }
}

function boundingBoxImageUrl(record: DatasetRecord) {
  return imageUrl(record, record.tokenBoxes.length ? 'crop' : record.box ? 'full' : 'crop')
}

function tokenBoxStyle(record: DatasetRecord, token: DatasetRecord['tokenBoxes'][number]) {
  const [left = 0, top = 0, right = 0, bottom = 0] = token.box
  const colors: Record<string, string> = {
    digit: '#f59e0b',
    character: '#38bdf8',
    province: '#f43f5e'
  }
  const cropWidth = record.cropWidth || 1
  const cropHeight = record.cropHeight || 1
  const directCoordinates = cropWidth <= 250 && cropHeight <= 150
  const minX = Math.min(...record.tokenBoxes.map(item => item.box[0] || 0))
  const maxX = Math.max(...record.tokenBoxes.map(item => item.box[2] || 0))
  const minY = Math.min(...record.tokenBoxes.map(item => item.box[1] || 0))
  const maxY = Math.max(...record.tokenBoxes.map(item => item.box[3] || 0))
  const rangeX = Math.max(1, maxX - minX)
  const rangeY = Math.max(1, maxY - minY)
  // Recent archive crops include extra side padding while token coordinates
  // come from the tighter recognition crop. Keep the overlay inside the
  // visible plate area instead of stretching the first/last token to the
  // full image edges.
  const plateLeftPercent = 22
  const plateWidthPercent = 56
  const leftPercent = directCoordinates ? left / cropWidth * 100 : plateLeftPercent + (left - minX) / rangeX * plateWidthPercent
  const topPercent = directCoordinates ? top / cropHeight * 100 : 24 + (top - minY) / rangeY * 52
  const widthPercent = directCoordinates ? (right - left) / cropWidth * 100 : (right - left) / rangeX * plateWidthPercent
  const heightPercent = directCoordinates ? (bottom - top) / cropHeight * 100 : (bottom - top) / rangeY * 52
  return {
    left: `${Math.max(0, Math.min(100, leftPercent))}%`,
    top: `${Math.max(0, Math.min(100, topPercent))}%`,
    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
    height: `${Math.max(0, Math.min(100, heightPercent))}%`,
    borderColor: colors[token.kind] || '#a78bfa'
  }
}

async function exportDataset(mode: 'selected' | 'filtered') {
  if (mode === 'selected' && selectedIds.value.length === 0) return
  exporting.value = true
  try {
    const result = await $fetch.raw<Blob>('/api/dataset/export', {
      method: 'POST',
      body: {
        ids: mode === 'selected' ? selectedIds.value : [],
        filters: {
          date: selectedDate.value,
          country: selectedCountry.value,
          status: selectedStatus.value,
          search: search.value
        }
      }
    })
    const raw = result._data as unknown
    const blob = raw instanceof Blob
      ? raw
      : new Blob([raw instanceof ArrayBuffer ? raw : JSON.stringify(raw)], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'onevision-yolo-detection.zip'
    link.click()
    URL.revokeObjectURL(url)
    toast.add({ title: 'Export ready', description: `${result.headers.get('x-onevision-exported') || 0} images exported in Ultralytics YOLO Detection 1.0 format.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Export failed', description: error instanceof Error ? error.message : 'Could not build the dataset archive.', color: 'error' })
  } finally {
    exporting.value = false
  }
}

function startDelete(record: DatasetRecord) {
  deleteTarget.value = { ids: [record.id], type: 'single' }
  deleteConfirmOpen.value = true
}

function startBulkDelete() {
  if (!selectedIds.value.length) return
  deleteTarget.value = { ids: [...selectedIds.value], type: 'bulk' }
  deleteConfirmOpen.value = true
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  const ids = target.ids
  const { error } = await deleteDataset(
    () => $fetch<DatasetDeleteResponse>('/api/dataset', { method: 'DELETE', body: { ids } }),
    { successMessage: `${ids.length} dataset record${ids.length === 1 ? '' : 's'} and associated image${ids.length === 1 ? '' : 's'} deleted.` }
  )
  if (!error) {
    selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
    if (selectedRecord.value && ids.includes(selectedRecord.value.id)) {
      selectedRecord.value = null
      editing.value = false
      detailOpen.value = false
      previewOpen.value = false
    }
    await refresh()
    if (!records.value.length && page.value > 1) page.value -= 1
  }
  deleteConfirmOpen.value = false
  deleteTarget.value = null
}
</script>

<template>
  <UDashboardPanel id="dataset-manager" grow>
    <template #header>
      <UDashboardNavbar title="Dataset Manager">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            label="Refresh from OneVision"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search plate, province or file..."
            class="w-64"
          />
          <USelect v-model="selectedDate" :items="[{ label: 'All dates', value: 'all' }, ...(dataset?.dates || []).map(date => ({ label: formatDate(date), value: date }))]" class="w-36" />
          <USelect v-model="selectedCountry" :items="[{ label: 'All countries', value: 'all' }, { label: 'Thai', value: 'thai' }, { label: 'Lao', value: 'laos' }]" class="w-36" />
          <USelect v-model="selectedStatus" :items="[{ label: 'All QC status', value: 'all' }, { label: 'PASS', value: 'PASS' }, { label: 'REVIEW', value: 'REVIEW' }, { label: 'REJECT', value: 'REJECT' }]" class="w-36" />
        </template>
        <template #right>
          <UButton
            v-if="selectedIds.length"
            icon="i-lucide-trash-2"
            color="error"
            variant="subtle"
            :label="`Delete selected (${selectedIds.length})`"
            :loading="deleting"
            @click="startBulkDelete"
          />
          <UButton
            v-if="selectedIds.length"
            icon="i-lucide-download"
            :loading="exporting"
            :label="`Export selected (${selectedIds.length})`"
            @click="exportDataset('selected')"
          />
          <UButton
            icon="i-lucide-package-check"
            color="neutral"
            variant="outline"
            :loading="exporting"
            label="Export filtered"
            @click="exportDataset('filtered')"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UDashboardPanelContent scrollable class="space-y-6 p-4 sm:p-6 lg:p-8">
        <div class="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                <UIcon name="i-lucide-folder-sync" class="size-5" />
              </div>
              <div>
                <p class="font-semibold text-highlighted">
                  OneVision scan archive
                </p>
                <p class="mt-1 text-xs text-muted">
                  อ่านข้อมูลจาก <span class="font-mono">{{ dataset?.root || 'scan/data' }}</span> · PASS เป็น pre-label ที่ควรตรวจสอบก่อนนำไป train
                </p>
              </div>
            </div>
            <UBadge color="info" variant="subtle">
              Ultralytics YOLO Detection 1.0
            </UBadge>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <UCard :ui="{ body: 'p-4' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              ทั้งหมด
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ stats.total.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              scan records
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Exportable
            </p><p class="mt-2 text-2xl font-semibold text-emerald-600">
              {{ stats.exportable.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              image + valid box
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              PASS
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ stats.pass.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              pre-label ready
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Review
            </p><p class="mt-2 text-2xl font-semibold text-amber-600">
              {{ stats.review.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              needs checking
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Missing image
            </p><p class="mt-2 text-2xl font-semibold text-red-600">
              {{ stats.missingImages.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              excluded from export
            </p>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0' }" class="overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default bg-elevated/30 px-4 py-3">
            <div class="flex items-center gap-3">
              <UCheckbox :model-value="allPageSelected" aria-label="Select current page" @update:model-value="togglePageSelection" /><span class="text-sm text-muted">เลือกหน้านี้ {{ selectedOnPage }}/{{ records.length }} · พบ {{ dataset?.total?.toLocaleString() || 0 }} รายการ</span>
            </div>
            <span class="text-xs text-muted">แสดงหน้า {{ page }} จาก {{ dataset?.totalPages || 1 }}</span>
          </div>
          <div v-if="pending" class="space-y-3 p-5">
            <USkeleton v-for="index in 8" :key="index" class="h-16 w-full" />
          </div>
          <div v-else-if="records.length === 0" class="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <UIcon name="i-lucide-database-zap" class="size-9 text-muted" /><p class="font-medium text-highlighted">
              ไม่พบข้อมูล dataset
            </p><p class="text-sm text-muted">
              ลองเปลี่ยนตัวกรองหรือกด Refresh from OneVision
            </p>
          </div>
          <div v-else>
            <div v-for="record in records" :key="record.id" class="grid gap-3 border-b border-default px-4 py-4 transition hover:bg-elevated/40 sm:grid-cols-[auto_auto_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto_auto] sm:items-center">
              <UCheckbox :model-value="selectedIds.includes(record.id)" :aria-label="`Select ${record.filename}`" @update:model-value="toggleRecord(record.id)" />
              <button class="size-12 overflow-hidden rounded-lg border border-default bg-elevated/50" :aria-label="`Preview ${record.plateText}`" @click="openDetail(record)">
                <img
                  :src="imageUrl(record)"
                  :alt="record.plateText"
                  class="size-full object-cover"
                  loading="lazy"
                >
              </button>
              <button class="min-w-0 text-left" @click="openDetail(record)">
                <p class="truncate font-mono text-sm font-semibold text-highlighted">
                  {{ record.plateText }}
                </p><p class="mt-1 truncate text-xs text-muted">
                  {{ record.filename }}
                </p>
              </button>
              <div class="min-w-0">
                <p class="truncate text-sm text-highlighted">
                  {{ record.province || 'Unknown province' }}
                </p><p class="mt-1 text-xs text-muted">
                  {{ formatDate(record.date) }} · {{ record.country === 'thai' ? 'Thai' : 'Lao' }} · {{ formatBytes(record.fileSize) }}
                </p>
              </div>
              <UBadge :color="statusColor(record.status)" variant="subtle" size="sm">
                {{ record.status }}
              </UBadge>
              <div class="text-right">
                <p class="text-sm text-highlighted">
                  {{ (record.confidence * 100).toFixed(1) }}%
                </p><p class="mt-1 text-xs" :class="record.labelReady ? 'text-emerald-600' : 'text-red-500'">
                  {{ record.labelReady ? 'ready' : 'skipped' }}
                </p>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`Delete ${record.filename}`"
                :loading="deleting && deleteTarget?.ids.includes(record.id)"
                @click="startDelete(record)"
              />
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default bg-elevated/20 p-4">
            <span class="text-xs text-muted">เลือกรวม {{ selectedIds.length }} รายการ</span><UPagination v-model:page="page" :total="dataset?.total || 0" :items-per-page="pageSize" />
          </div>
        </UCard>

        <UModal v-model:open="detailOpen" title="Dataset record details">
          <template #body>
            <div v-if="selectedRecord" class="space-y-5">
              <div v-if="editing" class="space-y-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <div>
                  <p class="font-semibold text-highlighted">
                    Edit CVAT annotation
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    Changes are saved to the source JSON and PostgreSQL database.
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Country">
                    <USelect v-model="editForm.country" :items="[{ label: 'Thai', value: 'thai' }, { label: 'Lao', value: 'laos' }]" class="w-full" />
                  </UFormField>
                  <UFormField label="QC status">
                    <USelect v-model="editForm.status" :items="[{ label: 'PASS', value: 'PASS' }, { label: 'REVIEW', value: 'REVIEW' }, { label: 'REJECT', value: 'REJECT' }]" class="w-full" />
                  </UFormField>
                  <UFormField label="Province">
                    <UInput v-model="editForm.province" class="w-full" />
                  </UFormField>
                  <div class="grid grid-cols-2 gap-3">
                    <UFormField label="Prefix">
                      <UInput v-model="editForm.platePrefix" class="w-full" />
                    </UFormField>
                    <UFormField label="Number">
                      <UInput v-model="editForm.plateNumber" class="w-full" />
                    </UFormField>
                  </div>
                </div>
                <div>
                  <p class="mb-2 text-sm font-medium text-highlighted">
                    Bounding box (left, top, right, bottom)
                  </p>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <UInput
                      v-for="(value, index) in editForm.box"
                      :key="index"
                      v-model.number="editForm.box[index]"
                      type="number"
                      min="0"
                      :placeholder="['Left', 'Top', 'Right', 'Bottom'][index]"
                    />
                  </div>
                </div>
                <div class="flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    :disabled="saving"
                    @click="editing = false"
                  />
                  <UButton
                    label="Save changes"
                    icon="i-lucide-save"
                    :loading="saving"
                    @click="saveEdit"
                  />
                </div>
              </div>
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-mono text-xl font-semibold text-highlighted">
                    {{ selectedRecord.plateText }}
                  </p><p class="mt-1 text-xs text-muted">
                    {{ selectedRecord.id }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge :color="statusColor(selectedRecord.status)" variant="subtle">
                    {{ selectedRecord.status }}
                  </UBadge>
                  <UButton
                    v-if="!editing"
                    icon="i-lucide-pencil"
                    color="primary"
                    variant="soft"
                    size="sm"
                    label="Edit"
                    @click="startEdit(selectedRecord)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="soft"
                    size="sm"
                    label="Delete"
                    :loading="deleting"
                    @click="startDelete(selectedRecord)"
                  />
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="relative flex w-full self-start items-center justify-center overflow-hidden rounded-xl border border-default bg-black/5" :style="{ aspectRatio: selectedRecord.imageWidth && selectedRecord.imageHeight ? `${selectedRecord.imageWidth} / ${selectedRecord.imageHeight}` : '16 / 9' }">
                  <img :src="imageUrl(selectedRecord, 'full')" :alt="`${selectedRecord.plateText} full vehicle`" class="max-h-full max-w-full object-contain">
                  <UButton
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 z-10 shadow-lg"
                    aria-label="Enlarge full vehicle image"
                    @click.stop="openImagePreview(selectedRecord, 'full')"
                  />
                </div>
                <div class="relative flex w-full self-start items-center justify-center overflow-hidden rounded-xl border border-default bg-black/5" :style="{ aspectRatio: selectedRecord.cropWidth && selectedRecord.cropHeight ? `${selectedRecord.cropWidth} / ${selectedRecord.cropHeight}` : '4 / 3' }">
                  <img :src="imageUrl(selectedRecord, 'crop')" :alt="`${selectedRecord.plateText} plate crop`" class="max-h-full max-w-full object-contain">
                  <UButton
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 z-10 shadow-lg"
                    aria-label="Enlarge plate crop image"
                    @click.stop="openImagePreview(selectedRecord, 'crop')"
                  />
                </div>
                <div class="relative overflow-hidden rounded-xl border border-default bg-black/5">
                  <div class="relative flex items-center justify-center bg-black/10" :style="{ aspectRatio: selectedRecord.tokenBoxes.length && selectedRecord.cropWidth && selectedRecord.cropHeight ? `${selectedRecord.cropWidth} / ${selectedRecord.cropHeight}` : selectedRecord.imageWidth && selectedRecord.imageHeight ? `${selectedRecord.imageWidth} / ${selectedRecord.imageHeight}` : '16 / 9' }">
                    <img :src="boundingBoxImageUrl(selectedRecord)" :alt="`${selectedRecord.plateText} bounding box preview`" class="absolute inset-0 size-full object-contain">
                    <template v-if="selectedRecord.tokenBoxes.length && selectedRecord.cropWidth && selectedRecord.cropHeight">
                      <span
                        v-for="token in selectedRecord.tokenBoxes"
                        :key="`${token.label}-${token.box.join('-')}`"
                        class="pointer-events-none absolute border-2"
                        :style="tokenBoxStyle(selectedRecord, token)"
                      >
                        <span class="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[9px] font-semibold text-white" :style="{ backgroundColor: tokenBoxStyle(selectedRecord, token).borderColor }">{{ token.label }}</span>
                      </span>
                    </template>
                    <span
                      v-else
                      class="pointer-events-none absolute border-2"
                      :class="selectedRecord.box ? 'border-red-500' : 'border-amber-400'"
                      :style="boundingBoxStyle(selectedRecord)"
                    />
                  </div>
                  <UButton
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 z-10 shadow-lg"
                    aria-label="Enlarge character boxes image"
                    @click.stop="openImagePreview(selectedRecord, 'boxes')"
                  />
                </div>
              </div>
              <div class="flex gap-4 text-xs text-muted">
                <span><UIcon name="i-lucide-image" class="mr-1 inline size-3" />Full vehicle</span>
                <span><UIcon name="i-lucide-scan-line" class="mr-1 inline size-3" />Plate crop</span>
                <span><UIcon name="i-lucide-square-dashed" class="mr-1 inline size-3" />{{ selectedRecord.tokenBoxes.length ? `Character boxes (${selectedRecord.tokenBoxes.length})` : selectedRecord.box ? 'Bounding box' : 'Crop ROI' }}</span>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-xs text-muted">
                    Source image
                  </p><p class="mt-1 break-all font-mono text-xs text-highlighted">
                    {{ selectedRecord.sourceImage || 'Not found' }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    Image size
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.imageWidth && selectedRecord.imageHeight ? `${selectedRecord.imageWidth} × ${selectedRecord.imageHeight}` : '—' }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    Bounding box
                  </p><p class="mt-1 font-mono text-xs text-highlighted">
                    {{ selectedRecord.box?.join(', ') || '—' }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    QC reasons
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.qcReasons.length ? selectedRecord.qcReasons.join(', ') : 'No reason recorded' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Character boxes
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.tokenBoxes.length || '—' }}
                  </p>
                </div>
              </div>
              <div class="rounded-xl bg-elevated/50 p-3 text-xs text-muted">
                Class 0: <span class="font-semibold text-highlighted">license_plate</span> · {{ selectedRecord.labelReady ? 'พร้อมสร้าง YOLO label' : 'จะถูกข้ามตอน export เนื่องจากภาพหรือ bounding box ไม่พร้อม' }}
              </div>
            </div>
          </template>
        </UModal>

        <ConfirmModal
          v-model:open="deleteConfirmOpen"
          :title="deleteTarget?.type === 'bulk' ? 'Delete selected dataset records' : 'Delete dataset record'"
          :description="`This permanently deletes ${deleteTarget?.ids.length || 0} JSON record${deleteTarget?.ids.length === 1 ? '' : 's'} and their associated vehicle, crop, and OCR images.`"
          confirm-label="Delete permanently"
          cancel-label="Cancel"
          :loading="deleting"
          @confirm="confirmDelete"
          @close="deleteTarget = null"
        />

        <UModal v-model:open="previewOpen" title="Image preview" :ui="{ content: 'sm:max-w-6xl' }">
          <template #body>
            <div v-if="selectedRecord" class="w-full">
              <div v-if="previewVariant === 'boxes'" class="max-h-[78vh] overflow-auto rounded-xl bg-black/80 p-2">
                <div class="relative mx-auto w-full" :style="{ aspectRatio: previewAspectRatio(selectedRecord, 'boxes') }">
                  <img :src="boundingBoxImageUrl(selectedRecord)" :alt="`${selectedRecord.plateText} bounding box preview`" class="absolute inset-0 size-full object-contain">
                  <template v-if="selectedRecord.tokenBoxes.length && selectedRecord.cropWidth && selectedRecord.cropHeight">
                    <span
                      v-for="token in selectedRecord.tokenBoxes"
                      :key="`preview-${token.label}-${token.box.join('-')}`"
                      class="pointer-events-none absolute border-2"
                      :style="tokenBoxStyle(selectedRecord, token)"
                    >
                      <span class="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-xs font-semibold text-white" :style="{ backgroundColor: tokenBoxStyle(selectedRecord, token).borderColor }">{{ token.label }}</span>
                    </span>
                  </template>
                  <span
                    v-else
                    class="pointer-events-none absolute border-2"
                    :class="selectedRecord.box ? 'border-red-500' : 'border-amber-400'"
                    :style="boundingBoxStyle(selectedRecord)"
                  />
                </div>
              </div>
              <div v-else class="flex max-h-[78vh] items-center justify-center overflow-auto rounded-xl bg-black/80 p-2">
                <img
                  :src="imageUrl(selectedRecord, previewVariant)"
                  :alt="`${selectedRecord.plateText} ${previewVariant} image`"
                  class="max-h-[74vh] max-w-full object-contain"
                >
              </div>
              <p class="mt-3 text-center text-xs text-muted">
                {{ previewVariant === 'full' ? 'Full vehicle' : previewVariant === 'crop' ? 'Plate crop' : `Character boxes (${selectedRecord.tokenBoxes.length})` }} · กดปุ่มปิดเพื่อกลับไปยังรายละเอียดรายการ
              </p>
            </div>
          </template>
        </UModal>
      </UDashboardPanelContent>
    </template>
  </UDashboardPanel>
</template>
