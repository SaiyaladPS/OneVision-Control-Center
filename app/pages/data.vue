<script setup lang="ts">
definePageMeta({ layout: 'default' })

interface PlateRecord {
  id: string
  scanId: string
  country: string
  province: string | null
  plateNumber: string | null
  ocrText: string | null
  confidenceLevel: string | null
  overallConfidence: number | null
  recognitionConfidence: number | null
  vehicleType: string | null
  plateType: string | null
  hasVehicleImage?: boolean
  hasCropImage?: boolean
  box: number[] | null
  modelPrimary: string | null
  tokenBoxes: Array<{ label: string, kind: string, confidence: number, box: number[] }>
}

const page = ref(1)
const pageSize = ref(12)
const search = ref('')
const confidenceLevel = ref('all')
const selectedRecord = ref<PlateRecord | null>(null)
const isDetailOpen = ref(false)
const imagePreviewOpen = ref(false)
const imagePreviewVariant = ref<'full' | 'crop'>('full')
const imagePreviewBox = ref(false)
const imageErrors = ref<Record<string, boolean>>({})
const imageDimensions = ref<Record<string, { width: number, height: number }>>({})

const { data: response, pending, refresh } = useApi<{ data: PlateRecord[], meta: { total: number } }>(() => {
  const params = new URLSearchParams({
    page: String(page.value),
    pageSize: String(pageSize.value),
    search: search.value
  })
  if (confidenceLevel.value !== 'all') params.set('confidenceLevel', confidenceLevel.value)
  return `/api/plates?${params.toString()}`
})

const { data: overview } = useApi<{ plates: number, scans: number, operators: number, averageConfidence: number }>('/api/plates/overview')
const records = computed(() => response.value?.data?.data || [])
const total = computed(() => response.value?.data?.meta?.total || 0)

watch([pageSize, confidenceLevel], () => {
  page.value = 1
  refresh()
})

function formatConfidence(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function confidenceColor(level: string | null) {
  if (level?.toLowerCase() === 'high') return 'success' as const
  if (level?.toLowerCase() === 'medium') return 'warning' as const
  return 'neutral' as const
}

function openDetail(record: PlateRecord) {
  selectedRecord.value = record
  isDetailOpen.value = true
}

function plateImageUrl(record: PlateRecord, variant: 'full' | 'crop' | 'ocr' = 'full') {
  return `/api/plates/image?id=${encodeURIComponent(record.id)}&variant=${variant}`
}

function imageErrorKey(record: PlateRecord, variant: 'full' | 'crop') {
  return `${record.id}:${variant}`
}

function imageFailed(record: PlateRecord, variant: 'full' | 'crop') {
  return Boolean(imageErrors.value[imageErrorKey(record, variant)])
}

function markImageFailed(record: PlateRecord, variant: 'full' | 'crop') {
  imageErrors.value[imageErrorKey(record, variant)] = true
}

function openImagePreview(variant: 'full' | 'crop', withBox = false) {
  imagePreviewVariant.value = variant
  imagePreviewBox.value = withBox
  imagePreviewOpen.value = true
}

function hasModelTokens(record: PlateRecord) {
  return record.tokenBoxes.length > 0
}

function rememberImageSize(record: PlateRecord, variant: 'full' | 'crop', event: Event) {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return
  imageDimensions.value[imageErrorKey(record, variant)] = {
    width: image.naturalWidth,
    height: image.naturalHeight
  }
}

function boundingCrop(record: PlateRecord) {
  const size = imageDimensions.value[imageErrorKey(record, 'full')]
  if (!record.box || !size) return null
  const [left = 0, top = 0, right = size.width, bottom = size.height] = record.box
  const paddingX = (right - left) * 0.2
  const paddingY = (bottom - top) * 0.2
  const x = Math.max(0, left - paddingX)
  const y = Math.max(0, top - paddingY)
  const cropRight = Math.min(size.width, right + paddingX)
  const cropBottom = Math.min(size.height, bottom + paddingY)
  return {
    x,
    y,
    width: Math.max(1, cropRight - x),
    height: Math.max(1, cropBottom - y)
  }
}

function boundingCropAspectRatio(record: PlateRecord) {
  const crop = boundingCrop(record)
  return crop ? `${crop.width} / ${crop.height}` : '16 / 9'
}

function boundingCropImageStyle(record: PlateRecord) {
  const size = imageDimensions.value[imageErrorKey(record, 'full')]
  const crop = boundingCrop(record)
  if (!size || !crop) return { width: '100%', height: '100%', left: '0%', top: '0%' }
  return {
    width: `${size.width / crop.width * 100}%`,
    height: `${size.height / crop.height * 100}%`,
    left: `${-crop.x / crop.width * 100}%`,
    top: `${-crop.y / crop.height * 100}%`
  }
}

function boundingBoxOverlayStyle(record: PlateRecord) {
  const crop = boundingCrop(record)
  if (!record.box || !crop) return { display: 'none' }
  const [left = crop.x, top = crop.y, right = crop.x + crop.width, bottom = crop.y + crop.height] = record.box
  return {
    left: `${Math.max(0, Math.min(100, (left - crop.x) / crop.width * 100))}%`,
    top: `${Math.max(0, Math.min(100, (top - crop.y) / crop.height * 100))}%`,
    width: `${Math.max(0, Math.min(100, (right - left) / crop.width * 100))}%`,
    height: `${Math.max(0, Math.min(100, (bottom - top) / crop.height * 100))}%`
  }
}

function modelBoxAspectRatio(record: PlateRecord) {
  const size = imageDimensions.value[imageErrorKey(record, 'crop')]
  return size ? `${size.width} / ${size.height}` : '4 / 3'
}

function modelTokenBoxStyle(record: PlateRecord, token: PlateRecord['tokenBoxes'][number]) {
  const size = imageDimensions.value[imageErrorKey(record, 'crop')]
  const colors: Record<string, string> = {
    digit: '#f59e0b',
    character: '#38bdf8',
    province: '#f43f5e'
  }
  if (!size) return { display: 'none', borderColor: colors[token.kind] || '#a78bfa' }
  const [left = 0, top = 0, right = 0, bottom = 0] = token.box
  const directCoordinates = size.width <= 250 && size.height <= 150
  const minX = Math.min(...record.tokenBoxes.map(item => item.box[0] || 0))
  const maxX = Math.max(...record.tokenBoxes.map(item => item.box[2] || 0))
  const minY = Math.min(...record.tokenBoxes.map(item => item.box[1] || 0))
  const maxY = Math.max(...record.tokenBoxes.map(item => item.box[3] || 0))
  const rangeX = Math.max(1, maxX - minX)
  const rangeY = Math.max(1, maxY - minY)
  const plateLeftPercent = 22
  const plateWidthPercent = 56
  const leftPercent = directCoordinates ? left / size.width * 100 : plateLeftPercent + (left - minX) / rangeX * plateWidthPercent
  const topPercent = directCoordinates ? top / size.height * 100 : 24 + (top - minY) / rangeY * 52
  const widthPercent = directCoordinates ? (right - left) / size.width * 100 : (right - left) / rangeX * plateWidthPercent
  const heightPercent = directCoordinates ? (bottom - top) / size.height * 100 : (bottom - top) / rangeY * 52
  return {
    left: `${Math.max(0, Math.min(100, leftPercent))}%`,
    top: `${Math.max(0, Math.min(100, topPercent))}%`,
    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
    height: `${Math.max(0, Math.min(100, heightPercent))}%`,
    borderColor: colors[token.kind] || '#a78bfa'
  }
}
</script>

<template>
  <UDashboardPanel id="data-registry" grow>
    <template #header>
      <UDashboardNavbar title="Data Registry">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            label="Refresh"
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
            placeholder="Search plate, province or vehicle..."
            class="w-72"
          />
          <USelect v-model="confidenceLevel" :items="[{ label: 'All confidence', value: 'all' }, { label: 'High confidence', value: 'HIGH' }, { label: 'Medium confidence', value: 'MEDIUM' }, { label: 'Low confidence', value: 'LOW' }]" class="w-40" />
        </template>
        <template #right>
          <span class="text-xs text-muted">{{ total.toLocaleString() }} plates in shared dataset</span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6 lg:p-8">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Detected plates
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ overview?.data?.plates?.toLocaleString() || '—' }}
            </p><p class="mt-1 text-xs text-muted">
              From Car Scan database
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Scan runs
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ overview?.data?.scans?.toLocaleString() || '—' }}
            </p><p class="mt-1 text-xs text-muted">
              Processed source files
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Operators
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ overview?.data?.operators || '—' }}
            </p><p class="mt-1 text-xs text-muted">
              Active contributors
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Avg. confidence
            </p><p class="mt-2 text-2xl font-semibold text-highlighted">
              {{ overview?.data?.averageConfidence ? `${overview.data.averageConfidence}%` : '—' }}
            </p><p class="mt-1 text-xs text-muted">
              Overall recognition quality
            </p>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0' }" class="overflow-hidden">
          <div class="hidden grid-cols-[0.8fr_1fr_1fr_0.8fr_0.7fr_0.7fr] gap-4 border-b border-default bg-elevated/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted lg:grid">
            <span>Plate</span><span>Location</span><span>Vehicle</span><span>Scan ID</span><span>Confidence</span><span>Quality</span>
          </div>
          <div v-if="pending" class="space-y-3 p-5">
            <USkeleton v-for="index in 6" :key="index" class="h-12 w-full" />
          </div>
          <div v-else-if="records.length === 0" class="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div class="flex size-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600">
              <UIcon name="i-lucide-database-zap" class="size-6" />
            </div><p class="font-medium text-highlighted">
              No records found
            </p><p class="text-sm text-muted">
              Try a different search or confidence filter.
            </p>
          </div>
          <div
            v-for="record in records"
            v-else
            :key="record.id"
            class="grid cursor-pointer gap-3 border-b border-default px-5 py-4 transition hover:bg-elevated/40 last:border-0 lg:grid-cols-[0.8fr_1fr_1fr_0.8fr_0.7fr_0.7fr] lg:items-center lg:gap-4"
            @click="openDetail(record)"
          >
            <div>
              <p class="font-mono text-sm font-semibold text-highlighted">
                {{ record.plateNumber || record.ocrText || 'Unrecognized' }}
              </p><p class="mt-1 text-xs text-muted">
                #{{ record.id }}
              </p>
            </div>
            <div>
              <p class="text-sm text-highlighted">
                {{ record.province || 'Unknown province' }}
              </p><p class="text-xs text-muted">
                {{ record.country }}
              </p>
            </div>
            <div>
              <p class="text-sm text-highlighted">
                {{ record.vehicleType || 'Unknown vehicle' }}
              </p><p class="text-xs text-muted">
                {{ record.plateType || 'Standard plate' }}
              </p>
            </div>
            <span class="font-mono text-xs text-muted">{{ record.scanId }}</span>
            <span class="text-sm text-highlighted">{{ formatConfidence(record.overallConfidence || record.recognitionConfidence) }}</span>
            <UBadge
              :color="confidenceColor(record.confidenceLevel)"
              variant="subtle"
              size="sm"
              class="w-fit"
            >
              {{ record.confidenceLevel || 'unrated' }}
            </UBadge>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default bg-elevated/20 p-4">
            <span class="text-xs text-muted">Showing {{ records.length }} of {{ total.toLocaleString() }} records</span><UPagination v-model:page="page" :total="total" :items-per-page="pageSize" />
          </div>
        </UCard>

        <UModal v-model:open="isDetailOpen" title="Plate record details">
          <template #body>
            <div v-if="selectedRecord" class="space-y-5">
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="relative overflow-hidden rounded-xl border border-default bg-black/10">
                  <div class="flex min-h-40 items-center justify-center p-2">
                    <img
                      v-if="!imageFailed(selectedRecord, 'full')"
                      :src="plateImageUrl(selectedRecord, 'full')"
                      :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} full vehicle`"
                      class="max-h-72 max-w-full object-contain"
                      @load="rememberImageSize(selectedRecord, 'full', $event)"
                      @error="markImageFailed(selectedRecord, 'full')"
                    >
                    <div v-else class="flex h-40 items-center justify-center px-4 text-center text-xs text-muted">
                      Full vehicle image unavailable
                    </div>
                  </div>
                  <UButton
                    v-if="!imageFailed(selectedRecord, 'full')"
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 shadow-lg"
                    aria-label="Enlarge full vehicle image"
                    @click.stop="openImagePreview('full')"
                  />
                  <p class="border-t border-default px-3 py-2 text-xs text-muted">
                    Full vehicle
                  </p>
                </div>
                <div class="relative overflow-hidden rounded-xl border border-default bg-black/10">
                  <div class="flex min-h-40 items-center justify-center p-2">
                    <img
                      v-if="!imageFailed(selectedRecord, 'crop')"
                      :src="plateImageUrl(selectedRecord, 'crop')"
                      :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} crop`"
                      class="max-h-72 max-w-full object-contain"
                      @load="rememberImageSize(selectedRecord, 'crop', $event)"
                      @error="markImageFailed(selectedRecord, 'crop')"
                    >
                    <div v-else class="flex h-40 items-center justify-center px-4 text-center text-xs text-muted">
                      Plate crop image unavailable
                    </div>
                  </div>
                  <UButton
                    v-if="!imageFailed(selectedRecord, 'crop')"
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 shadow-lg"
                    aria-label="Enlarge plate crop image"
                    @click.stop="openImagePreview('crop')"
                  />
                  <p class="border-t border-default px-3 py-2 text-xs text-muted">
                    Plate crop
                  </p>
                </div>
                <div class="relative overflow-hidden rounded-xl border border-default bg-black/10">
                  <div class="relative flex items-center justify-center bg-black/10" :style="{ aspectRatio: hasModelTokens(selectedRecord) ? modelBoxAspectRatio(selectedRecord) : boundingCropAspectRatio(selectedRecord) }">
                    <template v-if="hasModelTokens(selectedRecord)">
                      <img
                        v-if="!imageFailed(selectedRecord, 'crop')"
                        :src="plateImageUrl(selectedRecord, 'crop')"
                        :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} model boxes`"
                        class="absolute inset-0 size-full object-contain"
                        @load="rememberImageSize(selectedRecord, 'crop', $event)"
                        @error="markImageFailed(selectedRecord, 'crop')"
                      >
                      <template v-if="!imageFailed(selectedRecord, 'crop')">
                        <span
                          v-for="token in selectedRecord.tokenBoxes"
                          :key="`${token.label}-${token.box.join('-')}`"
                          class="pointer-events-none absolute z-10 border-2"
                          :style="modelTokenBoxStyle(selectedRecord, token)"
                        >
                          <span class="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[9px] font-semibold text-white" :style="{ backgroundColor: modelTokenBoxStyle(selectedRecord, token).borderColor }">
                            {{ token.label }}
                          </span>
                        </span>
                      </template>
                      <div v-else class="px-4 text-center text-xs text-muted">
                        Model crop image unavailable
                      </div>
                    </template>
                    <template v-else>
                      <img
                        v-if="!imageFailed(selectedRecord, 'full')"
                        :src="plateImageUrl(selectedRecord, 'full')"
                        :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} bounding box crop`"
                        class="absolute max-w-none"
                        :style="boundingCropImageStyle(selectedRecord)"
                        @load="rememberImageSize(selectedRecord, 'full', $event)"
                        @error="markImageFailed(selectedRecord, 'full')"
                      >
                      <span
                        v-if="selectedRecord.box && boundingCrop(selectedRecord)"
                        class="pointer-events-none absolute z-10 border-2 border-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
                        :style="boundingBoxOverlayStyle(selectedRecord)"
                      />
                      <div v-if="!selectedRecord.box" class="px-4 text-center text-xs text-muted">
                        Bounding box crop unavailable
                      </div>
                    </template>
                  </div>
                  <UButton
                    v-if="hasModelTokens(selectedRecord) ? !imageFailed(selectedRecord, 'crop') : selectedRecord.box && !imageFailed(selectedRecord, 'full')"
                    icon="i-lucide-maximize-2"
                    color="neutral"
                    variant="solid"
                    size="xs"
                    class="absolute right-2 top-2 shadow-lg"
                    aria-label="Enlarge model boxes image"
                    @click.stop="hasModelTokens(selectedRecord) ? openImagePreview('crop', true) : openImagePreview('full', true)"
                  />
                  <p class="border-t border-default px-3 py-2 text-xs text-muted">
                    {{ hasModelTokens(selectedRecord) ? `Model boxes (${selectedRecord.tokenBoxes.length})` : 'Bounding box crop' }}
                  </p>
                </div>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-xs text-muted">
                    Plate number
                  </p><p class="mt-1 font-mono text-lg font-semibold text-highlighted">
                    {{ selectedRecord.plateNumber || selectedRecord.ocrText || 'Unrecognized' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Confidence
                  </p><p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatConfidence(selectedRecord.overallConfidence || selectedRecord.recognitionConfidence) }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Province
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.province || '—' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Vehicle type
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.vehicleType || '—' }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Scan ID
                  </p><p class="mt-1 font-mono text-sm text-highlighted">
                    {{ selectedRecord.scanId }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-muted">
                    Country
                  </p><p class="mt-1 text-sm text-highlighted">
                    {{ selectedRecord.country }}
                  </p>
                </div>
              </div>
            </div>
          </template>
        </UModal>

        <UModal v-model:open="imagePreviewOpen" title="Plate image preview" :ui="{ content: 'sm:max-w-6xl' }">
          <template #body>
            <div v-if="selectedRecord" class="flex max-h-[78vh] items-center justify-center overflow-auto rounded-xl bg-black/80 p-2">
              <div v-if="imagePreviewBox && imagePreviewVariant === 'crop' && hasModelTokens(selectedRecord)" class="relative w-full overflow-hidden" :style="{ aspectRatio: modelBoxAspectRatio(selectedRecord) }">
                <img
                  v-if="!imageFailed(selectedRecord, 'crop')"
                  :src="plateImageUrl(selectedRecord, 'crop')"
                  :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} model boxes preview`"
                  class="absolute inset-0 size-full object-contain"
                  @load="rememberImageSize(selectedRecord, 'crop', $event)"
                  @error="markImageFailed(selectedRecord, 'crop')"
                >
                <template v-if="!imageFailed(selectedRecord, 'crop')">
                  <span
                    v-for="token in selectedRecord.tokenBoxes"
                    :key="`preview-${token.label}-${token.box.join('-')}`"
                    class="pointer-events-none absolute z-10 border-2"
                    :style="modelTokenBoxStyle(selectedRecord, token)"
                  >
                    <span class="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-xs font-semibold text-white" :style="{ backgroundColor: modelTokenBoxStyle(selectedRecord, token).borderColor }">
                      {{ token.label }}
                    </span>
                  </span>
                </template>
              </div>
              <div v-else-if="imagePreviewBox" class="relative w-full overflow-hidden" :style="{ aspectRatio: boundingCropAspectRatio(selectedRecord) }">
                <img
                  v-if="!imageFailed(selectedRecord, 'full')"
                  :src="plateImageUrl(selectedRecord, 'full')"
                  :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} bounding box crop preview`"
                  class="absolute max-w-none"
                  :style="boundingCropImageStyle(selectedRecord)"
                  @load="rememberImageSize(selectedRecord, 'full', $event)"
                  @error="markImageFailed(selectedRecord, 'full')"
                >
                <span
                  v-if="selectedRecord.box && boundingCrop(selectedRecord)"
                  class="pointer-events-none absolute z-10 border-2 border-red-500 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
                  :style="boundingBoxOverlayStyle(selectedRecord)"
                />
              </div>
              <img
                v-else-if="!imageFailed(selectedRecord, imagePreviewVariant)"
                :src="plateImageUrl(selectedRecord, imagePreviewVariant)"
                :alt="`${selectedRecord.plateNumber || selectedRecord.ocrText || 'Plate'} ${imagePreviewVariant} preview`"
                class="max-h-[74vh] max-w-full object-contain"
                @load="rememberImageSize(selectedRecord, imagePreviewVariant, $event)"
                @error="markImageFailed(selectedRecord, imagePreviewVariant)"
              >
              <p v-else class="p-12 text-sm text-muted">
                Image unavailable
              </p>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
