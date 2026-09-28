<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'default' })

interface CvatTask {
  id: number
  name: string
  projectId: number
  projectName: string
  status: string
  subset: string
  size: number
  mediaType: string
  jobs: number
  jobIds: number[]
  jobNames: string[]
  completedJobs: number
  jobStates: {
    new: number
    inProgress: number
    completed: number
    rejected: number
    other: number
  }
  assignee: string | null
  updatedAt: string
}

interface CvatProject {
  id: number
  name: string
  status: string
  dimension: string
  taskCount: number
  imageCount: number
  jobs: number
  completedJobs: number
  jobStates: {
    new: number
    inProgress: number
    completed: number
    rejected: number
    other: number
  }
  updatedAt: string
  tasks: CvatTask[]
}

interface CvatImageBox {
  label: string
  labelCode: string
  labelName: string
  labelId: number
  type: string
  points: number[]
}

interface CvatImageRecord {
  code: string
  annotationCode: string
  taskId: number
  taskName: string
  projectId: number
  projectName: string
  frame: number
  filename: string
  width: number
  height: number
  taskStatus: string
  jobStatus: string
  jobStatuses: string[]
  jobNames: string[]
  jobId: number | null
  jobName: string | null
  jobFrame: number | null
  jobPosition: number | null
  jobFrameCount: number | null
  boxes: CvatImageBox[]
}

interface CvatImageReport {
  items: CvatImageRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  filters: {
    projects: Array<{ id: number, name: string }>
    tasks: Array<{ id: number, name: string, projectId: number }>
    labels: string[]
  }
}

interface CvatOverview {
  baseUrl: string
  fetchedAt: string
  totals: {
    projects: number
    tasks: number
    images: number
    jobs: number
    completedJobs: number
  }
  projects: CvatProject[]
}

const search = ref('')
const { data: response, pending, refresh } = useApi<CvatOverview>('/api/cvat/overview', { retry: 0 })
const imagePage = ref(1)
const imageSearch = ref('')
const imageProject = ref('all')
const imageTask = ref('all')
const imageLabel = ref('all')
const imageStatus = ref('all')
const imageBox = ref('all')
const jobFilter = ref('all')
const jobSearch = ref('')
const IMAGE_PAGE_SIZE = 24
const MAX_IMAGE_ZOOM = 10
const imageZoom = ref<Record<string, number>>({})
const imagePan = ref<Record<string, { x: number, y: number }>>({})
const imageDrag = ref<Record<string, { startX: number, startY: number, panX: number, panY: number }>>({})
const { data: imageResponse, pending: imagesPending, refresh: refreshImages } = useApi<CvatImageReport>(() => {
  const params = new URLSearchParams({
    page: String(imagePage.value),
    pageSize: String(IMAGE_PAGE_SIZE),
    search: imageSearch.value,
    projectId: imageProject.value,
    taskId: imageTask.value,
    label: imageLabel.value,
    status: imageStatus.value,
    jobStatus: jobFilter.value,
    jobSearch: jobSearch.value,
    box: imageBox.value
  })
  return `/api/cvat/images?${params.toString()}`
}, { retry: 0 })
const workspace = computed(() => response.value?.data)
const imageReport = computed(() => imageResponse.value?.data)
const imageRecords = computed(() => imageReport.value?.items || [])
const imageTasks = computed(() => imageReport.value?.filters.tasks || [])

const filteredProjects = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return workspace.value?.projects || []

  return (workspace.value?.projects || []).filter((project) => {
    const projectText = `${project.name} ${project.status} ${project.dimension}`.toLowerCase()
    const taskText = project.tasks.map(task => `${task.name} ${task.status} ${task.assignee || ''}`).join(' ').toLowerCase()
    return `${projectText} ${taskText}`.includes(term)
  })
})

const visibleProjects = computed(() => filteredProjects.value
  .map(project => ({
    ...project,
    tasks: jobFilter.value === 'all'
      ? project.tasks
      : project.tasks.filter(task => task.jobStates[jobFilter.value as keyof CvatTask['jobStates']] > 0)
  }))
  .filter(project => jobFilter.value === 'all' || project.tasks.length > 0))

function updatedLabel(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

function projectUrl(projectId: number) {
  return `${workspace.value?.baseUrl || ''}/projects/${projectId}`
}

function taskUrl(taskId: number) {
  return `${workspace.value?.baseUrl || ''}/tasks/${taskId}`
}

function cvatImageUrl(record: CvatImageRecord) {
  return `/api/cvat/image?taskId=${record.taskId}&frame=${record.frame}`
}

function imageZoomValue(code: string) {
  return imageZoom.value[code] || 1
}

function imagePanValue(code: string) {
  return imagePan.value[code] || { x: 0, y: 0 }
}

function clampImagePan(code: string) {
  const zoom = imageZoomValue(code)
  const maxPan = Math.max(0, (zoom - 1) * 50)
  const pan = imagePanValue(code)
  imagePan.value[code] = {
    x: Math.min(maxPan, Math.max(-maxPan, pan.x)),
    y: Math.min(maxPan, Math.max(-maxPan, pan.y))
  }
}

function setImageZoom(code: string, nextZoom: number, focus?: { x: number, y: number }) {
  const currentZoom = imageZoomValue(code)
  const zoom = Math.min(MAX_IMAGE_ZOOM, Math.max(1, Number(nextZoom.toFixed(2))))
  const currentPan = imagePanValue(code)
  imageZoom.value[code] = zoom

  if (zoom === 1) {
    imagePan.value[code] = { x: 0, y: 0 }
  } else if (focus && currentZoom !== zoom) {
    const ratio = zoom / currentZoom
    imagePan.value[code] = {
      x: focus.x - (focus.x - currentPan.x) * ratio,
      y: focus.y - (focus.y - currentPan.y) * ratio
    }
    clampImagePan(code)
  } else {
    clampImagePan(code)
  }
}

function changeImageZoom(code: string, amount: number) {
  setImageZoom(code, imageZoomValue(code) + amount)
}

function resetImageZoom(code: string) {
  imageZoom.value[code] = 1
  imagePan.value[code] = { x: 0, y: 0 }
}

function imageTransformStyle(code: string) {
  const pan = imagePanValue(code)
  return {
    transform: `translate(${pan.x}%, ${pan.y}%) scale(${imageZoomValue(code)})`,
    transformOrigin: 'center'
  }
}

function handleImageWheel(code: string, event: WheelEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const focus = {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 100,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 100
  }
  const amount = event.deltaY < 0 ? 0.25 : -0.25
  setImageZoom(code, imageZoomValue(code) + amount, focus)
}

function handleImageDoubleClick(code: string, event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const focus = {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 100,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 100
  }
  const nextZoom = imageZoomValue(code) >= MAX_IMAGE_ZOOM ? 1 : imageZoomValue(code) + 0.5
  setImageZoom(code, nextZoom, focus)
}

function beginImagePan(code: string, event: PointerEvent) {
  if (event.button !== 0 || imageZoomValue(code) <= 1) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  imageDrag.value[code] = {
    startX: event.clientX,
    startY: event.clientY,
    panX: imagePanValue(code).x,
    panY: imagePanValue(code).y
  }
  target.setPointerCapture?.(event.pointerId)
}

function moveImagePan(code: string, event: PointerEvent) {
  const drag = imageDrag.value[code]
  if (!drag) return
  const target = event.currentTarget as HTMLElement
  const zoom = imageZoomValue(code)
  const maxPan = Math.max(0, (zoom - 1) * 50)
  const nextX = drag.panX + ((event.clientX - drag.startX) / Math.max(1, target.clientWidth)) * 100
  const nextY = drag.panY + ((event.clientY - drag.startY) / Math.max(1, target.clientHeight)) * 100
  imagePan.value[code] = {
    x: Math.min(maxPan, Math.max(-maxPan, nextX)),
    y: Math.min(maxPan, Math.max(-maxPan, nextY))
  }
}

function endImagePan(code: string, event?: PointerEvent) {
  const target = event?.currentTarget as HTMLElement | undefined
  if (event && target?.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
  delete imageDrag.value[code]
}

function imageBoxStyle(record: CvatImageRecord, box: CvatImageBox) {
  const points = box.points
  const zoom = imageZoomValue(record.code)
  const pan = imagePanValue(record.code)
  const scalePosition = (value: number, panOffset: number) => 50 + (value - 50) * zoom + panOffset
  if (!record.width || !record.height || points.length < 4) {
    return {
      left: `${scalePosition(2, pan.x)}%`,
      top: `${scalePosition(2, pan.y)}%`,
      width: `${96 * zoom}%`,
      height: `${96 * zoom}%`,
      borderWidth: '1px'
    }
  }
  const xValues = points.filter((_, index) => index % 2 === 0)
  const yValues = points.filter((_, index) => index % 2 === 1)
  const left = Math.max(0, Math.min(100, Math.min(...xValues) / record.width * 100))
  const top = Math.max(0, Math.min(100, Math.min(...yValues) / record.height * 100))
  const right = Math.max(0, Math.min(100, Math.max(...xValues) / record.width * 100))
  const bottom = Math.max(0, Math.min(100, Math.max(...yValues) / record.height * 100))
  return {
    left: `${scalePosition(left, pan.x)}%`,
    top: `${scalePosition(top, pan.y)}%`,
    width: `${Math.max(0, right - left) * zoom}%`,
    height: `${Math.max(0, bottom - top) * zoom}%`,
    borderWidth: '1px'
  }
}

function imagePosition(index: number) {
  return (imagePage.value - 1) * IMAGE_PAGE_SIZE + index + 1
}

function imageStatusColor(status: string) {
  const normalized = status.toLowerCase()
  return normalized === 'completed' || normalized === 'annotation' ? 'success' as const : normalized === 'in progress' ? 'warning' as const : 'neutral' as const
}

const jobStateLabels = [
  { key: 'new', label: 'New' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'other', label: 'Other' }
] as const

async function refreshWorkspace() {
  await Promise.all([refresh(), refreshImages()])
}

watch([imageSearch, imageProject, imageTask, imageLabel, imageStatus, imageBox, jobFilter, jobSearch], () => {
  imagePage.value = 1
  refreshImages()
})
watch(imagePage, () => refreshImages())
watch(response, () => refreshImages())
</script>

<template>
  <UDashboardPanel id="cvat-workspace" grow>
    <template #header>
      <UDashboardNavbar title="CVAT annotation workspace">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge v-if="workspace" color="success" variant="subtle">
            Connected
          </UBadge>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Refresh"
            color="neutral"
            variant="outline"
            :loading="pending || imagesPending"
            @click="refreshWorkspace"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6 lg:p-8">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Manage annotation projects and tasks
            </p>
            <p class="mt-1 max-w-3xl text-sm text-muted">
              Review live CVAT workspace data from OneVision-report. Use the links on each card to continue detailed annotation work in CVAT.
            </p>
          </div>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search projects or tasks..."
            class="w-full lg:w-80"
          />
          <USelect v-model="jobFilter" :items="[{ label: 'All job status', value: 'all' }, { label: 'New', value: 'new' }, { label: 'In progress', value: 'inProgress' }, { label: 'Completed', value: 'completed' }, { label: 'Rejected', value: 'rejected' }, { label: 'Other', value: 'other' }]" class="w-full lg:w-44" />
        </div>

        <div v-if="pending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <USkeleton v-for="index in 4" :key="index" class="h-28 rounded-xl" />
        </div>
        <UPageCard v-else-if="!workspace" variant="subtle">
          <div class="flex items-start gap-3 py-5">
            <UIcon name="i-lucide-cloud-off" class="mt-0.5 size-5 text-warning" />
            <div>
              <p class="font-medium text-highlighted">CVAT workspace is unavailable</p>
              <p class="mt-1 text-sm text-muted">
                Check the CVAT URL and credentials in the server environment, then refresh this page.
              </p>
            </div>
          </div>
        </UPageCard>
        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <UCard :ui="{ body: 'p-4' }">
              <p class="text-xs uppercase tracking-wider text-muted">Projects</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ workspace.totals.projects }}</p>
            </UCard>
            <UCard :ui="{ body: 'p-4' }">
              <p class="text-xs uppercase tracking-wider text-muted">Tasks</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ workspace.totals.tasks }}</p>
            </UCard>
            <UCard :ui="{ body: 'p-4' }">
              <p class="text-xs uppercase tracking-wider text-muted">Images</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ workspace.totals.images.toLocaleString() }}</p>
            </UCard>
            <UCard :ui="{ body: 'p-4' }">
              <p class="text-xs uppercase tracking-wider text-muted">Jobs</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ workspace.totals.jobs }}</p>
            </UCard>
            <UCard :ui="{ body: 'p-4' }">
              <p class="text-xs uppercase tracking-wider text-muted">Completed</p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ workspace.totals.completedJobs }}</p>
            </UCard>
          </div>

          <section class="space-y-4 rounded-2xl border border-default bg-elevated/10 p-4 sm:p-5">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="text-sm font-semibold text-highlighted">Image annotations from CVAT</p>
                <p class="mt-1 text-xs text-muted">รูปจาก CVAT พร้อม bounding box, label และ code ของแต่ละ frame</p>
              </div>
              <span class="text-xs text-muted">{{ imageReport?.total?.toLocaleString() || 0 }} images</span>
            </div>

            <div class="flex flex-wrap gap-2 rounded-xl border border-default bg-default/40 p-3">
              <UInput v-model="imageSearch" icon="i-lucide-search" placeholder="Search code, file, task or label..." class="w-full sm:w-72" />
              <UInput v-model="jobSearch" icon="i-lucide-briefcase-business" placeholder="Search job name or ID..." class="w-full sm:w-56" />
              <USelect v-model="imageProject" :items="[{ label: 'All projects', value: 'all' }, ...(imageReport?.filters.projects || []).map(project => ({ label: project.name, value: String(project.id) }))]" class="w-44" />
              <USelect v-model="imageTask" :items="[{ label: 'All tasks', value: 'all' }, ...imageTasks.map(task => ({ label: task.name, value: String(task.id) }))]" class="w-48" />
              <USelect v-model="imageLabel" :items="[{ label: 'All labels', value: 'all' }, ...(imageReport?.filters.labels || []).map(label => ({ label, value: label }))]" class="w-40" />
              <USelect v-model="imageStatus" :items="[{ label: 'All task status', value: 'all' }, { label: 'Annotation', value: 'annotation' }, { label: 'Completed', value: 'completed' }, { label: 'Validation', value: 'validation' }]" class="w-44" />
              <USelect v-model="jobFilter" :items="[{ label: 'All job status', value: 'all' }, { label: 'New', value: 'new' }, { label: 'In progress', value: 'inProgress' }, { label: 'Completed', value: 'completed' }, { label: 'Rejected', value: 'rejected' }, { label: 'Other', value: 'other' }]" class="w-44" />
              <UBadge v-if="jobFilter !== 'all'" color="warning" variant="subtle">Job: {{ jobFilter === 'inProgress' ? 'In progress' : jobFilter }}</UBadge>
              <USelect v-model="imageBox" :items="[{ label: 'All images', value: 'all' }, { label: 'With box', value: 'with-box' }, { label: 'Without box', value: 'without-box' }]" class="w-40" />
            </div>

            <div v-if="imagesPending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <USkeleton v-for="index in 8" :key="index" class="h-72 rounded-xl" />
            </div>
            <div v-else-if="!imageRecords.length" class="rounded-xl border border-dashed border-default px-5 py-14 text-center">
              <UIcon name="i-lucide-image-off" class="size-8 text-muted" />
              <p class="mt-3 font-medium text-highlighted">No CVAT images found</p>
              <p class="mt-1 text-sm text-muted">ลองเปลี่ยน filter หรือค้นหาด้วย code/label อื่น</p>
            </div>
            <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <UCard v-for="(record, index) in imageRecords" :key="record.code" :ui="{ body: 'p-0' }" class="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                <div class="relative aspect-[4/3] overflow-hidden bg-black/85 select-none touch-none" :class="imageZoomValue(record.code) > 1 ? (imageDrag[record.code] ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'" :style="{ aspectRatio: record.width && record.height ? `${record.width} / ${record.height}` : '4 / 3' }" @wheel.prevent.stop="handleImageWheel(record.code, $event)" @dblclick.stop="handleImageDoubleClick(record.code, $event)" @pointerdown="beginImagePan(record.code, $event)" @pointermove="moveImagePan(record.code, $event)" @pointerup="endImagePan(record.code, $event)" @pointercancel="endImagePan(record.code, $event)">
                  <div class="absolute inset-0" :class="imageDrag[record.code] ? '' : 'transition-transform duration-150'" :style="imageTransformStyle(record.code)">
                    <img :src="cvatImageUrl(record)" :alt="`${record.filename} ${record.code}`" class="absolute inset-0 size-full object-contain" loading="lazy">
                  </div>
                  <template v-for="box in record.boxes" :key="`${record.code}-${box.labelId}-${box.points.join('-')}`">
                    <span class="group pointer-events-auto absolute border-solid border-red-400 transition-colors hover:border-yellow-300" :style="imageBoxStyle(record, box)" :title="`${box.labelCode} - ${box.labelName}`">
                      <span class="pointer-events-none absolute inset-0 rounded-sm bg-red-400/5 opacity-0 transition-opacity group-hover:opacity-100" />
                      <span class="pointer-events-auto absolute -top-5 left-0 cursor-help whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {{ box.labelCode }}
                      </span>
                      <span v-if="box.labelName !== box.labelCode" class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-950 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover:block">{{ box.labelCode }} - {{ box.labelName }}</span>
                    </span>
                    </template>
                  <div class="relative z-10 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent p-3">
                    <div class="flex items-center gap-1.5">
                      <UBadge color="info" variant="solid" size="sm">CVAT</UBadge>
                      <span class="rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">#{{ imagePosition(index) }} / {{ imageReport?.total || 0 }}</span>
                    </div>
                    <UBadge :color="imageStatusColor(record.jobStatus)" variant="solid" size="sm">{{ record.jobStatus }}</UBadge>
                  </div>
                  <div class="absolute right-2 top-11 z-20 flex items-center gap-1 rounded-lg bg-black/65 p-1 text-white shadow-lg" @pointerdown.stop>
                    <UButton icon="i-lucide-minus" color="neutral" variant="ghost" size="xs" aria-label="Zoom out" :disabled="imageZoomValue(record.code) <= 1" @click.stop="changeImageZoom(record.code, -0.25)" />
                    <button class="min-w-10 px-1 text-[10px] font-semibold" type="button" :aria-label="`Reset zoom for ${record.code}`" @click.stop="resetImageZoom(record.code)">{{ Math.round(imageZoomValue(record.code) * 100) }}%</button>
                    <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="xs" aria-label="Zoom in" :disabled="imageZoomValue(record.code) >= MAX_IMAGE_ZOOM" @click.stop="changeImageZoom(record.code, 0.25)" />
                  </div>
                  <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10 text-white">
                    <span class="truncate rounded bg-black/60 px-2 py-1 font-mono text-[11px]" :title="record.code">{{ record.code }}</span>
                    <span class="shrink-0 rounded bg-black/60 px-2 py-1 text-[11px]">{{ record.boxes.length }} box{{ record.boxes.length === 1 ? '' : 'es' }}</span>
                  </div>
                </div>
                <div class="space-y-2 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <p class="truncate text-sm font-semibold text-highlighted" :title="record.filename">{{ record.filename }}</p>
                    <span class="shrink-0 text-xs text-muted">F{{ record.frame }}</span>
                  </div>
                  <p class="truncate font-mono text-sm font-semibold text-primary" :title="record.annotationCode">Code: {{ record.annotationCode || '—' }}</p>
                  <p class="truncate text-xs text-muted" :title="record.taskName">{{ record.projectName }} · {{ record.taskName }}</p>
                  <p class="text-xs text-muted">Task ID: <span class="font-mono text-highlighted">{{ record.taskId }}</span></p>
                  <p v-if="record.jobId !== null" class="text-xs text-muted">
                    Job ID: <span class="font-mono text-highlighted">{{ record.jobId }}</span>
                    <span v-if="record.jobFrame !== null">· CVAT job frame: <span class="font-mono text-highlighted">{{ record.jobFrame }}</span></span>
                    <span v-if="record.jobPosition !== null && record.jobFrameCount !== null">({{ record.jobPosition }} / {{ record.jobFrameCount }})</span>
                  </p>
                  <p v-else class="truncate text-xs text-muted" :title="record.jobNames.join(', ')">Job ID: unavailable</p>
                  <p class="truncate text-xs text-muted" :title="record.boxes.map(box => box.labelName).join(', ')">{{ record.boxes.map(box => box.labelCode).join(', ') || 'No annotation label' }}</p>
                </div>
              </UCard>
            </div>

            <div class="flex justify-end border-t border-default pt-4">
              <UPagination v-model:page="imagePage" :total="imageReport?.total || 0" :items-per-page="IMAGE_PAGE_SIZE" />
            </div>
          </section>

          <div v-if="!visibleProjects.length" class="rounded-2xl border border-dashed border-default px-5 py-16 text-center">
            <UIcon name="i-lucide-search-x" class="size-8 text-muted" />
            <p class="mt-3 font-medium text-highlighted">No CVAT projects found</p>
            <p class="mt-1 text-sm text-muted">Try another project or task name.</p>
          </div>

          <div v-else class="grid gap-5 xl:grid-cols-2">
            <UPageCard v-for="project in visibleProjects" :key="project.id" variant="subtle">
              <div class="flex flex-col gap-4">
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="truncate text-lg font-semibold text-highlighted">{{ project.name }}</h2>
                      <UBadge :label="project.status" color="neutral" variant="subtle" />
                    </div>
                    <p class="mt-1 text-xs text-muted">
                      Project #{{ project.id }} · {{ project.dimension }} · Updated {{ updatedLabel(project.updatedAt) }}
                    </p>
                  </div>
                  <UButton
                    :to="projectUrl(project.id)"
                    target="_blank"
                    label="Open CVAT"
                    icon="i-lucide-external-link"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                </div>

                <div class="grid grid-cols-3 gap-2 rounded-xl bg-elevated/40 p-3 text-center">
                  <div>
                    <p class="text-lg font-semibold text-highlighted">{{ project.taskCount }}</p>
                    <p class="text-[11px] text-muted">Tasks</p>
                  </div>
                  <div>
                    <p class="text-lg font-semibold text-highlighted">{{ project.imageCount.toLocaleString() }}</p>
                    <p class="text-[11px] text-muted">Images</p>
                  </div>
                  <div>
                    <p class="text-lg font-semibold text-highlighted">{{ project.completedJobs }} / {{ project.jobs }}</p>
                    <p class="text-[11px] text-muted">Completed jobs</p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span class="mr-1 text-muted">Job status:</span>
                  <span
                    v-for="state in jobStateLabels"
                    :key="state.key"
                    v-show="project.jobStates[state.key] > 0"
                    class="rounded-full border border-default bg-elevated/40 px-2 py-0.5 text-muted"
                  >
                    {{ state.label }} {{ project.jobStates[state.key] }}
                  </span>
                </div>

                <div class="overflow-x-auto rounded-xl border border-default">
                  <table class="min-w-full text-left text-sm">
                    <thead class="border-b border-default bg-elevated/30 text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th class="px-3 py-2 font-medium">Task</th>
                        <th class="px-3 py-2 font-medium">Status</th>
                        <th class="px-3 py-2 text-right font-medium">Images</th>
                        <th class="px-3 py-2 text-right font-medium">Job status</th>
                        <th class="px-3 py-2 text-right font-medium">Open</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <tr v-for="task in project.tasks" :key="task.id">
                        <td class="max-w-52 px-3 py-3">
                          <p class="truncate font-medium text-highlighted" :title="task.name">{{ task.name }}</p>
                          <p class="mt-0.5 text-xs text-muted">{{ task.assignee || 'Unassigned' }} · {{ task.subset || 'No subset' }}</p>
                        </td>
                        <td class="px-3 py-3"><UBadge :label="task.status" color="neutral" variant="subtle" size="sm" /></td>
                        <td class="px-3 py-3 text-right">{{ task.size.toLocaleString() }}</td>
                        <td class="px-3 py-3 text-right">
                          <div class="flex min-w-44 flex-wrap justify-end gap-1">
                            <span
                              v-for="state in jobStateLabels"
                              :key="state.key"
                              v-show="task.jobStates[state.key] > 0"
                              class="rounded-full border border-default bg-elevated/40 px-2 py-0.5 text-[11px] text-muted"
                            >
                              {{ state.label }} {{ task.jobStates[state.key] }}
                            </span>
                            <span v-if="!task.jobs" class="text-xs text-muted">No jobs</span>
                            <span v-else class="max-w-56 truncate text-[11px] text-muted" :title="task.jobNames.join(', ')">{{ task.jobNames.join(', ') }}</span>
                          </div>
                        </td>
                        <td class="px-3 py-3 text-right">
                          <UButton
                            :to="taskUrl(task.id)"
                            target="_blank"
                            icon="i-lucide-arrow-up-right"
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            aria-label="Open CVAT task"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </UPageCard>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
