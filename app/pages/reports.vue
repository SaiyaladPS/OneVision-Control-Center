<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'default' })

interface Report {
  id: string
  scanId: string
  name: string
  description: string
  type: string
  owner: string
  updated: string
  status: string
  plateCount: number
  mediaType: string
}

interface ReportsPayload {
  reports: Report[]
  total: number
  generatedAt: string
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
  projects: Array<{
    id: number
    name: string
    status: string
    dimension: string
    taskCount: number
    imageCount: number
    jobs: number
    completedJobs: number
    updatedAt: string
  }>
}

const toast = useToast()
const search = ref('')
const reportType = ref('All reports')
const selectedReport = ref<string | null>(null)
const reportToneClasses: Record<string, string> = {
  cyan: 'bg-cyan-500/10 text-cyan-600',
  violet: 'bg-violet-500/10 text-violet-600',
  amber: 'bg-amber-500/10 text-amber-600'
}

const { data: reportResponse, pending, refresh: refreshReports } = useApi<ReportsPayload>('/api/reports?limit=100')
const { data: overviewResponse, refresh: refreshOverview } = useApi<{ plates: number, scans: number, operators: number, averageConfidence: number }>('/api/plates/overview')
const { data: cvatResponse, pending: cvatPending, refresh: refreshCvat } = useApi<CvatOverview>('/api/cvat/overview', { retry: 0 })
const { connectionState, isConfigured, lastEvent } = useOneVisionSocket()

const reports = computed(() => reportResponse.value?.data?.reports || [])
const overview = computed(() => overviewResponse.value?.data)
const cvatOverview = computed(() => cvatResponse.value?.data)
const filteredReports = computed(() => reports.value.filter((report) => {
  const term = search.value.trim().toLowerCase()
  const matchesSearch = !term || `${report.name} ${report.description} ${report.type} ${report.owner}`.toLowerCase().includes(term)
  const matchesType = reportType.value === 'All reports' || report.type === reportType.value
  return matchesSearch && matchesType
}))
const lastReport = computed(() => reports.value[0])
const connectionLabel = computed(() => ({
  idle: 'Preparing connection',
  connecting: 'Connecting to OneVision',
  connected: 'Live connection',
  disconnected: isConfigured.value ? 'Connection offline' : 'Demo data mode',
  error: 'Connection error'
}[connectionState.value]))

function reportColor(report: Report) {
  return report.mediaType === 'camera' ? 'violet' : report.mediaType === 'video' ? 'amber' : 'cyan'
}

function reportIcon(report: Report) {
  return report.mediaType === 'camera' ? 'i-lucide-video' : report.mediaType === 'video' ? 'i-lucide-film' : 'i-lucide-image'
}

function formatUpdated(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

async function refreshFromOneVision(event: { type: string } | null) {
  if (!event || !['SCAN_SAVED', 'PLATE_SAVED', 'REPORT_READY'].includes(event.type)) return
  await Promise.all([refreshReports(), refreshOverview()])
  toast.add({ title: 'New OneVision report received', description: 'The report list was updated in real time.', color: 'success' })
}

watch(lastEvent, refreshFromOneVision)

function generateReport() {
  toast.add({ title: 'Reports are generated from OneVision saves', description: 'Save a scan in OneVision and this page will update automatically.', color: 'info' })
}

function downloadReport(report: Report) {
  toast.add({ title: 'Report download', description: `Report ${report.id} is ready for export.`, color: 'info' })
}

async function refreshAll() {
  await Promise.all([refreshReports(), refreshOverview(), refreshCvat()])
}
</script>

<template>
  <UDashboardPanel id="reports" grow>
    <template #header>
      <UDashboardNavbar title="Reports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="hidden items-center gap-2 rounded-full border border-default bg-elevated/50 px-3 py-1.5 text-xs text-muted sm:flex">
            <span class="size-2 rounded-full" :class="connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'" />
            {{ connectionLabel }}
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            label="Refresh"
            :loading="pending"
            @click="refreshAll"
          />
          <UButton icon="i-lucide-plus" label="Create report" @click="generateReport" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search reports..."
            class="w-64"
          />
          <USelect v-model="reportType" :items="['All reports', 'Data quality']" class="w-36" />
        </template>
        <template #right>
          <div class="hidden items-center gap-2 text-xs text-muted sm:flex">
            <span class="size-2 rounded-full" :class="connectionState === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'" />
            Real-time updates enabled
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6 lg:p-8">
        <div class="grid gap-4 sm:grid-cols-3">
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Total reports
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ overview?.scans?.toLocaleString() || reports.length.toLocaleString() }}
            </p>
            <p class="mt-1 text-xs text-emerald-600">
              From shared OneVision database
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Ready to review
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ reports.filter(report => report.status === 'Ready').length }}
            </p>
            <p class="mt-1 text-xs text-muted">
              Live report records
            </p>
          </UCard>
          <UCard :ui="{ body: 'p-5' }">
            <p class="text-xs uppercase tracking-wider text-muted">
              Last generated
            </p>
            <p class="mt-2 text-3xl font-semibold text-highlighted">
              {{ lastReport ? formatUpdated(lastReport.updated) : '—' }}
            </p>
            <p class="mt-1 truncate text-xs text-muted">
              {{ lastReport?.name || 'Waiting for OneVision data' }}
            </p>
          </UCard>
        </div>

        <section class="space-y-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-highlighted">
                CVAT annotation workspace
              </p>
              <p class="mt-1 text-xs text-muted">
                Live project and task summary from the configured CVAT server.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge v-if="cvatOverview" color="success" variant="subtle">
                Connected
              </UBadge>
              <UButton
                to="/cvat-workspace"
                label="Manage workspace"
                icon="i-lucide-arrow-up-right"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
          </div>

          <div v-if="cvatPending" class="grid gap-4 sm:grid-cols-4">
            <USkeleton v-for="index in 4" :key="index" class="h-24 rounded-xl" />
          </div>
          <UPageCard v-else-if="!cvatOverview" variant="subtle">
            <div class="flex items-start gap-3 py-3">
              <UIcon name="i-lucide-cloud-off" class="mt-0.5 size-5 text-warning" />
              <div>
                <p class="font-medium text-highlighted">CVAT data is unavailable</p>
                <p class="mt-1 text-sm text-muted">Check the CVAT URL and credentials in the server environment.</p>
              </div>
            </div>
          </UPageCard>
          <template v-else>
            <div class="grid gap-4 sm:grid-cols-4">
              <UCard :ui="{ body: 'p-4' }">
                <p class="text-xs uppercase tracking-wider text-muted">Projects</p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">{{ cvatOverview.totals.projects }}</p>
              </UCard>
              <UCard :ui="{ body: 'p-4' }">
                <p class="text-xs uppercase tracking-wider text-muted">Tasks</p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">{{ cvatOverview.totals.tasks }}</p>
              </UCard>
              <UCard :ui="{ body: 'p-4' }">
                <p class="text-xs uppercase tracking-wider text-muted">Images</p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">{{ cvatOverview.totals.images.toLocaleString() }}</p>
              </UCard>
              <UCard :ui="{ body: 'p-4' }">
                <p class="text-xs uppercase tracking-wider text-muted">Completed jobs</p>
                <p class="mt-2 text-2xl font-semibold text-highlighted">{{ cvatOverview.totals.completedJobs }} / {{ cvatOverview.totals.jobs }}</p>
              </UCard>
            </div>
            <UPageCard variant="subtle" :ui="{ body: 'p-0' }">
              <div class="overflow-x-auto">
                <table class="min-w-full text-left text-sm">
                  <thead class="border-b border-default text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th class="px-4 py-3 font-medium">Project</th>
                      <th class="px-4 py-3 font-medium">Status</th>
                      <th class="px-4 py-3 text-right font-medium">Tasks</th>
                      <th class="px-4 py-3 text-right font-medium">Images</th>
                      <th class="px-4 py-3 text-right font-medium">Jobs</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr v-for="project in cvatOverview.projects" :key="project.id">
                      <td class="px-4 py-3 font-medium text-highlighted">{{ project.name }}</td>
                      <td class="px-4 py-3"><UBadge :label="project.status" color="neutral" variant="subtle" /></td>
                      <td class="px-4 py-3 text-right">{{ project.taskCount }}</td>
                      <td class="px-4 py-3 text-right">{{ project.imageCount.toLocaleString() }}</td>
                      <td class="px-4 py-3 text-right">{{ project.completedJobs }} / {{ project.jobs }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </UPageCard>
          </template>
        </section>

        <div class="flex items-end justify-between">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              Report library
            </p>
            <p class="mt-1 text-xs text-muted">
              รายงานจากข้อมูลที่บันทึกใน OneVision และอัปเดตผ่าน WebSocket
            </p>
          </div>
          <span class="text-xs text-muted">{{ filteredReports.length }} results</span>
        </div>

        <div v-if="pending" class="grid gap-4 lg:grid-cols-2">
          <USkeleton v-for="index in 4" :key="index" class="h-44 rounded-xl" />
        </div>
        <div v-else-if="filteredReports.length === 0" class="rounded-2xl border border-dashed border-default px-5 py-16 text-center">
          <UIcon name="i-lucide-file-bar-chart" class="size-8 text-muted" />
          <p class="mt-3 font-medium text-highlighted">
            No reports found
          </p>
          <p class="mt-1 text-sm text-muted">
            Save a scan in OneVision to create a report here.
          </p>
        </div>
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <UCard
            v-for="report in filteredReports"
            :key="report.id"
            class="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
            :class="selectedReport === report.id ? 'ring-2 ring-primary' : ''"
            :ui="{ body: 'p-5' }"
            @click="selectedReport = report.id"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex gap-3">
                <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl" :class="reportToneClasses[reportColor(report)]">
                  <UIcon :name="reportIcon(report)" class="size-5" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-highlighted">
                    {{ report.name }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ report.id }} · Scan #{{ report.scanId }}
                  </p>
                </div>
              </div>
              <UBadge color="success" variant="subtle" size="sm">
                {{ report.status }}
              </UBadge>
            </div>
            <p class="mt-4 text-sm leading-6 text-muted">
              {{ report.description }}
            </p>
            <div class="mt-5 flex items-center justify-between border-t border-default pt-4">
              <div class="flex items-center gap-2 text-xs text-muted">
                <UAvatar size="2xs" :alt="report.owner" /><span>{{ report.owner }}</span><span>·</span><span>{{ formatUpdated(report.updated) }}</span>
              </div>
              <UButton
                icon="i-lucide-download"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Download report"
                @click.stop="downloadReport(report)"
              />
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
