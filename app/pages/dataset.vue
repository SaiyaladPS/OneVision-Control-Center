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
const { t } = useAppLocale()
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
const hasFilters = computed(() => Boolean(search.value || selectedDate.value !== 'all' || selectedCountry.value !== 'all' || selectedStatus.value !== 'all'))
const pageIds = computed(() => records.value.map(record => record.id))
const selectedOnPage = computed(() => pageIds.value.filter(id => selectedIds.value.includes(id)).length)
const allPageSelected = computed(() => pageIds.value.length > 0 && selectedOnPage.value === pageIds.value.length)
const pageSizeOptions = [20, 50, 100].map(value => ({ label: String(value), value }))
const quickFilters = computed(() => [
  { label: t('dataset.all'), value: 'all' },
  { label: t('dataset.pass'), value: 'PASS' },
  { label: t('dataset.review'), value: 'REVIEW' },
  { label: t('dataset.reject'), value: 'REJECT' }
])

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

function countryLabel(country: DatasetRecord['country']) {
  return country === 'thai' ? t('dataset.thai') : t('dataset.lao')
}

function statusLabel(status: DatasetStatus) {
  return status === 'PASS' ? t('dataset.pass') : status === 'REVIEW' ? t('dataset.review') : t('dataset.reject')
}

function clearFilters() {
  search.value = ''
  selectedDate.value = 'all'
  selectedCountry.value = 'all'
  selectedStatus.value = 'all'
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
    { successMessage: t('dataset.saveChanges') }
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
    toast.add({ title: t('dataset.exportReady'), description: `${result.headers.get('x-onevision-exported') || 0} ${t('dataset.exportedImages')}.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: t('dataset.exportFailed'), description: error instanceof Error ? error.message : t('dataset.exportError'), color: 'error' })
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
    { successMessage: `${ids.length} ${t('dataset.records')} deleted.` }
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
      <UDashboardNavbar :title="t('dataset.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :label="t('dataset.refresh')"
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
            :placeholder="t('dataset.search')"
            class="w-64"
          />
          <USelect v-model="selectedDate" :items="[{ label: t('dataset.allDates'), value: 'all' }, ...(dataset?.dates || []).map(date => ({ label: formatDate(date), value: date }))]" class="w-36" />
          <USelect v-model="selectedCountry" :items="[{ label: t('dataset.allCountries'), value: 'all' }, { label: t('dataset.thai'), value: 'thai' }, { label: t('dataset.lao'), value: 'laos' }]" class="w-36" />
          <USelect v-model="selectedStatus" :items="[{ label: t('dataset.allStatus'), value: 'all' }, { label: t('dataset.pass'), value: 'PASS' }, { label: t('dataset.review'), value: 'REVIEW' }, { label: t('dataset.reject'), value: 'REJECT' }]" class="w-36" />
          <UButton
            v-if="hasFilters"
            :label="t('dataset.clearFilters')"
            color="neutral"
            variant="ghost"
            @click="clearFilters"
          />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-package-check"
            color="neutral"
            variant="outline"
            :loading="exporting"
            :label="t('dataset.exportFiltered')"
            @click="exportDataset('filtered')"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="min-h-0 flex-1 overflow-y-auto space-y-6 p-4 sm:p-6 lg:p-8">
        <div class="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-indigo-50 p-4 shadow-sm dark:border-cyan-900 dark:from-cyan-950/30 dark:via-default dark:to-indigo-950/20">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                <UIcon name="i-lucide-folder-sync" class="size-5" />
              </div>
              <div>
                <p class="font-semibold text-highlighted">
                  {{ t('dataset.archiveTitle') }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ t('dataset.archiveDescription') }} <span class="font-mono">{{ dataset?.root || 'scan/data' }}</span>
                  <span class="block">{{ t('dataset.envHint') }} · {{ t('dataset.reviewHint') }}</span>
                </p>
              </div>
            </div>
            <UBadge color="info" variant="subtle">
              {{ t('dataset.format') }}
            </UBadge>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-slate-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.total') }}
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ stats.total.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.records') }}
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-emerald-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.exportable') }}
            </p><p class="mt-2 text-2xl font-semibold text-emerald-600">
              {{ stats.exportable.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.validBox') }}
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-blue-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.pass') }}
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ stats.pass.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.prelabelReady') }}
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-amber-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.review') }}
            </p><p class="mt-2 text-2xl font-semibold text-amber-600">
              {{ stats.review.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.needsChecking') }}
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-red-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.reject') }}
            </p><p class="mt-2 text-2xl font-semibold text-red-600">
              {{ stats.reject.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.rejected') }}
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-4' }" class="border-l-4 border-l-rose-400 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ t('dataset.missingImage') }}
            </p><p class="mt-2 text-2xl font-semibold text-red-600">
              {{ stats.missingImages.toLocaleString() }}
            </p><p class="mt-1 text-xs text-muted">
              {{ t('dataset.excluded') }}
            </p>
          </UCard>
        </div>

        <div class="flex flex-col gap-3 rounded-2xl border border-default bg-elevated/20 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-2">
            <span class="mr-1 text-xs font-semibold uppercase tracking-wider text-muted">{{ t('dataset.quickFilters') }}</span>
            <UButton
              v-for="filter in quickFilters"
              :key="filter.value"
              :label="filter.label"
              :color="selectedStatus === filter.value ? 'primary' : 'neutral'"
              :variant="selectedStatus === filter.value ? 'soft' : 'ghost'"
              size="sm"
              @click="selectedStatus = filter.value"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted">{{ t('dataset.pageSize') }}</span>
            <USelect
              v-model="pageSize"
              :items="pageSizeOptions"
              size="sm"
              class="w-20"
            />
          </div>
        </div>

        <UCard :ui="{ body: 'p-0' }" class="overflow-hidden shadow-sm">
          <div class="flex flex-col gap-1 border-b border-default px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2">
              <div class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-list-checks" class="size-4" />
              </div>
              <div>
                <p class="font-semibold text-highlighted">
                  {{ t('dataset.recordsTitle') }}
                </p>
                <p class="text-xs text-muted">
                  {{ t('dataset.listDescription') }}
                </p>
              </div>
            </div>
            <UBadge color="neutral" variant="subtle" class="w-fit">
              {{ dataset?.total?.toLocaleString() || 0 }} {{ t('dataset.records') }}
            </UBadge>
          </div>
          <div v-if="selectedIds.length" class="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-highlighted">
              <UIcon name="i-lucide-check-square" class="size-4 text-primary" />
              {{ t('dataset.selectedCount', { n: selectedIds.length }) }}
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-lucide-download"
                size="sm"
                :loading="exporting"
                :label="t('dataset.exportSelected')"
                @click="exportDataset('selected')"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="subtle"
                size="sm"
                :label="t('dataset.deleteSelected')"
                :loading="deleting"
                @click="startBulkDelete"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('dataset.clearSelection')"
                @click="selectedIds = []"
              />
            </div>
          </div>
          <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-default bg-elevated/80 px-4 py-3 backdrop-blur">
            <div class="flex items-center gap-3">
              <UCheckbox :model-value="allPageSelected" :aria-label="t('dataset.selectPage')" @update:model-value="togglePageSelection" /><span class="text-sm text-muted">{{ t('dataset.selectPage') }} {{ selectedOnPage }}/{{ records.length }} · {{ t('dataset.found') }} {{ dataset?.total?.toLocaleString() || 0 }} {{ t('dataset.records') }}</span>
            </div>
            <span class="text-xs text-muted">{{ t('dataset.pageOf', { page: String(page), pages: String(dataset?.totalPages || 1) }) }}</span>
          </div>
          <div v-if="pending" class="space-y-3 p-5">
            <USkeleton v-for="index in 8" :key="index" class="h-16 w-full" />
          </div>
          <div v-else-if="records.length === 0" class="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <UIcon name="i-lucide-database-zap" class="size-9 text-muted" /><p class="font-medium text-highlighted">
              {{ t('dataset.emptyTitle') }}
            </p><p class="text-sm text-muted">
              {{ t('dataset.emptyDescription') }}
            </p>
          </div>
          <div v-else>
            <div class="hidden border-b border-default bg-elevated/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:grid sm:grid-cols-[auto_auto_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto_auto_auto] sm:items-center sm:gap-3">
              <span />
              <span />
              <span>{{ t('dataset.recordColumn') }}</span>
              <span>{{ t('dataset.locationColumn') }}</span>
              <span>{{ t('dataset.qualityColumn') }}</span>
              <span>{{ t('dataset.confidenceColumn') }}</span>
              <span class="col-span-2 text-right">{{ t('dataset.actionsColumn') }}</span>
            </div>
            <div v-for="record in records" :key="record.id" class="group grid gap-3 border-b border-default px-4 py-4 transition hover:bg-primary/5 sm:grid-cols-[auto_auto_minmax(0,1.5fr)_minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
              <UCheckbox :model-value="selectedIds.includes(record.id)" :aria-label="`${t('dataset.selectRecord')} ${record.filename}`" @update:model-value="toggleRecord(record.id)" />
              <button class="size-12 overflow-hidden rounded-lg border border-default bg-elevated/50 shadow-sm transition group-hover:border-primary/50 group-hover:shadow-md" :aria-label="`${t('dataset.preview')} ${record.plateText}`" @click="openDetail(record)">
                <img
                  :src="imageUrl(record)"
                  :alt="record.plateText"
                  class="size-full object-cover"
                  loading="lazy"
                >
              </button>
              <button class="min-w-0 text-left" @click="openDetail(record)">
                <p class="truncate font-mono text-sm font-semibold text-highlighted transition group-hover:text-primary">
                  {{ record.plateText }}
                </p><p class="mt-1 truncate text-xs text-muted">
                  {{ record.filename }}
                </p>
              </button>
              <div class="min-w-0">
                <p class="truncate text-sm text-highlighted">
                  {{ record.province || t('dataset.unknownProvince') }}
                </p><p class="mt-1 text-xs text-muted">
                  {{ formatDate(record.date) }} · {{ countryLabel(record.country) }} · {{ formatBytes(record.fileSize) }}
                </p>
              </div>
              <UBadge
                :color="statusColor(record.status)"
                variant="subtle"
                size="sm"
                class="w-fit"
              >
                {{ statusLabel(record.status) }}
              </UBadge>
              <div class="text-right">
                <p class="text-sm text-highlighted">
                  {{ (record.confidence * 100).toFixed(1) }}%
                </p>
                <div class="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-elevated">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: `${Math.max(4, record.confidence * 100)}%` }"
                  />
                </div>
                <p class="mt-1 text-xs" :class="record.labelReady ? 'text-emerald-600' : 'text-red-500'">
                  {{ record.labelReady ? t('dataset.ready') : t('dataset.skipped') }}
                </p>
              </div>
              <UButton
                icon="i-lucide-eye"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`${t('dataset.openDetails')} ${record.filename}`"
                @click="openDetail(record)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :aria-label="`${t('dataset.delete')} ${record.filename}`"
                :loading="deleting && deleteTarget?.ids.includes(record.id)"
                @click="startDelete(record)"
              />
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default bg-elevated/20 p-4">
            <span class="text-xs text-muted">{{ t('dataset.selectedCount', { n: selectedIds.length }) }}</span><UPagination v-model:page="page" :total="dataset?.total || 0" :items-per-page="pageSize" />
          </div>
        </UCard>

        <UModal v-model:open="detailOpen" :title="t('dataset.details')">
          <template #body>
            <div v-if="selectedRecord" class="space-y-5">
              <div v-if="editing" class="space-y-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <div>
                  <p class="font-semibold text-highlighted">
                    {{ t('dataset.editAnnotation') }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ t('dataset.editDescription') }}
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField :label="t('dataset.country')">
                    <USelect v-model="editForm.country" :items="[{ label: t('dataset.thai'), value: 'thai' }, { label: t('dataset.lao'), value: 'laos' }]" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('dataset.status')">
                    <USelect v-model="editForm.status" :items="[{ label: t('dataset.pass'), value: 'PASS' }, { label: t('dataset.review'), value: 'REVIEW' }, { label: t('dataset.reject'), value: 'REJECT' }]" class="w-full" />
                  </UFormField>
                  <UFormField :label="t('dataset.province')">
                    <UInput v-model="editForm.province" class="w-full" />
                  </UFormField>
                  <div class="grid grid-cols-2 gap-3">
                    <UFormField :label="t('dataset.prefix')">
                      <UInput v-model="editForm.platePrefix" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('dataset.number')">
                      <UInput v-model="editForm.plateNumber" class="w-full" />
                    </UFormField>
                  </div>
                </div>
                <div>
                  <p class="mb-2 text-sm font-medium text-highlighted">
                    {{ t('dataset.boundingBox') }}
                  </p>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <UInput
                      v-for="(value, index) in editForm.box"
                      :key="index"
                      v-model.number="editForm.box[index]"
                      type="number"
                      min="0"
                      :placeholder="[t('dataset.left'), t('dataset.top'), t('dataset.right'), t('dataset.bottom')][index]"
                    />
                  </div>
                </div>
                <div class="flex justify-end gap-2">
                  <UButton
                    :label="t('dataset.cancel')"
                    color="neutral"
                    variant="ghost"
                    :disabled="saving"
                    @click="editing = false"
                  />
                  <UButton
                    :label="t('dataset.saveChanges')"
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
                    {{ statusLabel(selectedRecord.status) }}
                  </UBadge>
                  <UButton
                    v-if="!editing"
                    icon="i-lucide-pencil"
                    color="primary"
                    variant="soft"
                    size="sm"
                    :label="t('dataset.edit')"
                    @click="startEdit(selectedRecord)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="soft"
                    size="sm"
                    :label="t('dataset.delete')"
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
                    :aria-label="t('dataset.enlargeFull')"
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
                    :aria-label="t('dataset.enlargeCrop')"
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
                    :aria-label="t('dataset.enlargeBoxes')"
                    @click.stop="openImagePreview(selectedRecord, 'boxes')"
                  />
                </div>
              </div>
              <div class="flex gap-4 text-xs text-muted">
                <span><UIcon name="i-lucide-image" class="mr-1 inline size-3" />{{ t('dataset.fullVehicle') }}</span>
                <span><UIcon name="i-lucide-scan-line" class="mr-1 inline size-3" />{{ t('dataset.plateCrop') }}</span>
                <span><UIcon name="i-lucide-square-dashed" class="mr-1 inline size-3" />{{ selectedRecord.tokenBoxes.length ? `${t('dataset.characterBoxes')} (${selectedRecord.tokenBoxes.length})` : selectedRecord.box ? t('dataset.boundingBoxShort') : t('dataset.cropRoi') }}</span>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-xs text-muted">
                    {{ t('dataset.sourceImage') }}
                  </p><p class="mt-1 break-all font-mono text-xs text-highlighted">
                    {{ selectedRecord.sourceImage || t('dataset.notFound') }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    {{ t('dataset.imageSize') }}
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.imageWidth && selectedRecord.imageHeight ? `${selectedRecord.imageWidth} × ${selectedRecord.imageHeight}` : '—' }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    {{ t('dataset.boundingBoxShort') }}
                  </p><p class="mt-1 font-mono text-xs text-highlighted">
                    {{ selectedRecord.box?.join(', ') || '—' }}
                  </p>
                </div><div>
                  <p class="text-xs text-muted">
                    {{ t('dataset.qcReasons') }}
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.qcReasons.length ? selectedRecord.qcReasons.join(', ') : t('dataset.noReason') }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    {{ t('dataset.characterBoxes') }}
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.tokenBoxes.length || '—' }}
                  </p>
                </div>
              </div>
              <div class="rounded-xl bg-elevated/50 p-3 text-xs text-muted">
                Class 0: <span class="font-semibold text-highlighted">license_plate</span> · {{ selectedRecord.labelReady ? t('dataset.classLabel') : t('dataset.classSkipped') }}
              </div>
            </div>
          </template>
        </UModal>

        <ConfirmModal
          v-model:open="deleteConfirmOpen"
          :title="deleteTarget?.type === 'bulk' ? t('dataset.deleteSelectedTitle') : t('dataset.deleteTitle')"
          :description="`${t('dataset.deleteDescription')} (${deleteTarget?.ids.length || 0} ${t('dataset.records')}).`"
          :confirm-label="t('dataset.deletePermanently')"
          :cancel-label="t('dataset.cancel')"
          :loading="deleting"
          @confirm="confirmDelete"
          @close="deleteTarget = null"
        />

        <UModal v-model:open="previewOpen" :title="t('dataset.imagePreview')" :ui="{ content: 'sm:max-w-6xl' }">
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
                {{ previewVariant === 'full' ? t('dataset.fullVehicle') : previewVariant === 'crop' ? t('dataset.plateCrop') : `${t('dataset.characterBoxes')} (${selectedRecord.tokenBoxes.length})` }}
              </p>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
