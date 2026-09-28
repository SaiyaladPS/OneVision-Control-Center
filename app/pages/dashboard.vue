<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'default' })

const { connectionState, isConnected, isConfigured, events, lastMessageAt, connect, pushEvent } = useOneVisionSocket()
const { data: overview } = useApi<{ plates: number, scans: number, operators: number, averageConfidence: number }>('/api/plates/overview')
const toast = useToast()
const activePeriod = ref('Last 7 days')

const metrics = computed(() => [
  { label: 'Detected plates', value: overview.value?.data?.plates?.toLocaleString() || '—', change: 'Live', note: 'shared dataset', icon: 'i-lucide-layers-3', tone: 'cyan' },
  { label: 'Scan runs', value: overview.value?.data?.scans?.toLocaleString() || '—', change: 'Live', note: 'processed sources', icon: 'i-lucide-radio-tower', tone: 'violet' },
  { label: 'Active operators', value: overview.value?.data?.operators?.toString() || '—', change: 'Live', note: 'contributors', icon: 'i-lucide-file-check-2', tone: 'emerald' },
  { label: 'Avg. confidence', value: overview.value?.data?.averageConfidence ? `${overview.value.data.averageConfidence}%` : '—', change: 'Live', note: 'recognition quality', icon: 'i-lucide-shield-check', tone: 'amber' }
])

const chartBars = [46, 58, 52, 74, 63, 81, 68, 88, 72, 94, 84, 100]
const toneClasses: Record<string, string> = {
  cyan: 'bg-cyan-500/10 text-cyan-600',
  violet: 'bg-violet-500/10 text-violet-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber: 'bg-amber-500/10 text-amber-600'
}
const sourceRows = [
  { name: 'Order Gateway', type: 'API stream', records: '8,420', status: 'Healthy', updated: '2 min ago', icon: 'i-lucide-shopping-bag', color: 'cyan' },
  { name: 'Customer API', type: 'REST / JSON', records: '6,281', status: 'Healthy', updated: '5 min ago', icon: 'i-lucide-users', color: 'violet' },
  { name: 'Inventory Service', type: 'WebSocket', records: '5,114', status: 'Healthy', updated: '1 min ago', icon: 'i-lucide-boxes', color: 'emerald' },
  { name: 'Finance Ledger', type: 'SQL connector', records: '5,077', status: 'Attention', updated: '18 min ago', icon: 'i-lucide-wallet-cards', color: 'amber' }
]

const eventIcon = (severity: string) => ({ success: 'i-lucide-check', warning: 'i-lucide-alert-triangle', error: 'i-lucide-x', info: 'i-lucide-arrow-down-to-line' }[severity] || 'i-lucide-activity')
const eventTone = (severity: string) => ({ success: 'text-emerald-600 bg-emerald-500/10', warning: 'text-amber-600 bg-amber-500/10', error: 'text-red-600 bg-red-500/10', info: 'text-cyan-700 bg-cyan-500/10' }[severity] || 'text-slate-600 bg-slate-500/10')
const connectionLabel = computed(() => ({ idle: 'Preparing connection', connecting: 'Connecting to OneVision', connected: 'Live connection', disconnected: isConfigured.value ? 'Connection offline' : 'Demo data mode', error: 'Connection error' }[connectionState.value]))
const lastUpdated = computed(() => lastMessageAt.value ? formatDistanceToNow(new Date(lastMessageAt.value), { addSuffix: true }) : 'Waiting for events')

function simulateEvent() {
  pushEvent({ id: `evt-${Date.now()}`, type: 'DATA_INGESTED', source: 'OneVision Simulator', message: 'A live data event was received for preview', severity: 'success', timestamp: new Date().toISOString() })
  toast.add({ title: 'Live event added', description: 'The event stream has been updated.', color: 'success' })
}
</script>

<template>
  <UDashboardPanel id="overview" grow>
    <template #header>
      <UDashboardNavbar title="Overview" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="hidden items-center gap-2 rounded-full border border-default bg-elevated/50 px-3 py-1.5 text-xs text-muted sm:flex">
            <span class="relative flex size-2"><span v-if="isConnected" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span class="relative inline-flex size-2 rounded-full" :class="isConnected ? 'bg-emerald-500' : 'bg-amber-500'" /></span>
            {{ connectionLabel }}
          </div>
          <UButton
            v-if="!isConnected && isConfigured"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            label="Reconnect"
            @click="connect"
          />
          <UButton icon="i-lucide-plus" label="New report" to="/reports" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6 lg:p-8">
        <section class="relative overflow-hidden rounded-3xl bg-[#10283a] px-6 py-7 text-white shadow-xl shadow-cyan-950/10 sm:px-8">
          <div class="pointer-events-none absolute -right-16 -top-28 size-80 rounded-full border-[24px] border-cyan-300/10" /><div class="pointer-events-none absolute -bottom-40 right-24 size-96 rounded-full border-[32px] border-teal-300/10" />
          <div class="relative max-w-2xl">
            <p class="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              OneVision control center
            </p><h1 class="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              See every signal. Make every decision count.
            </h1><p class="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              ติดตามข้อมูลจากทุกแหล่ง วิเคราะห์ประสิทธิภาพ และจัดการรายงานของระบบ OneVision จากพื้นที่เดียว
            </p><div class="mt-6 flex flex-wrap gap-3">
              <UButton
                label="View reports"
                icon="i-lucide-arrow-up-right"
                color="primary"
                to="/reports"
              /><UButton
                label="Explore data registry"
                icon="i-lucide-database"
                variant="soft"
                color="neutral"
                to="/data"
                class="bg-white/10 text-white hover:bg-white/20"
              />
            </div>
          </div>
        </section>

        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="metric in metrics"
            :key="metric.label"
            class="border-default/70 shadow-sm"
            :ui="{ body: 'p-5' }"
          >
            <div class="flex items-start justify-between">
              <div class="flex size-10 items-center justify-center rounded-2xl" :class="toneClasses[metric.tone]">
                <UIcon :name="metric.icon" class="size-5" />
              </div><UBadge color="success" variant="subtle" size="sm">
                {{ metric.change }}
              </UBadge>
            </div><p class="mt-5 text-sm text-muted">
              {{ metric.label }}
            </p><div class="mt-1 flex items-baseline gap-2">
              <span class="text-2xl font-semibold tracking-tight text-highlighted">{{ metric.value }}</span><span class="text-xs text-muted">{{ metric.note }}</span>
            </div>
          </UCard>
        </section>

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-5 py-5 sm:px-6' }" class="overflow-hidden">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-highlighted">
                    Data activity
                  </p><p class="mt-1 text-xs text-muted">
                    Records processed across connected sources
                  </p>
                </div><USelect
                  v-model="activePeriod"
                  :items="['Last 7 days', 'Last 30 days', 'This year']"
                  class="w-32"
                  size="sm"
                />
              </div>
            </template><div class="px-5 pb-5 sm:px-6">
              <div class="flex items-end justify-between gap-2 border-b border-default pb-3">
                <div><span class="text-3xl font-semibold tracking-tight text-highlighted">24.9K</span><span class="ml-2 text-xs font-medium text-emerald-600">+12.8%</span></div><span class="text-xs text-muted">Sep 18 — Sep 24, 2026</span>
              </div><div class="mt-7 flex h-48 items-end gap-2 sm:gap-3">
                <div v-for="(bar, index) in chartBars" :key="index" class="group flex h-full flex-1 items-end">
                  <div class="relative w-full rounded-t-lg bg-cyan-500/15 transition-all group-hover:bg-cyan-500/30" :style="{ height: `${bar}%` }">
                    <div class="absolute inset-x-0 bottom-0 rounded-t-lg bg-gradient-to-t from-cyan-600 to-teal-400 opacity-90" :style="{ height: `${Math.max(30, bar - 12)}%` }" />
                  </div>
                </div>
              </div><div class="mt-3 flex justify-between text-[10px] text-muted">
                <span>Sep 18</span><span>Sep 20</span><span>Sep 22</span><span>Sep 24</span>
              </div>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0', header: 'px-5 py-5' }" class="overflow-hidden">
            <template #header>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-highlighted">
                    Live event stream
                  </p><p class="mt-1 text-xs text-muted">
                    {{ lastUpdated }}
                  </p>
                </div><UButton
                  icon="i-lucide-more-horizontal"
                  color="neutral"
                  variant="ghost"
                  to="/reports"
                  aria-label="Open reports"
                />
              </div>
            </template><div class="divide-y divide-default">
              <div v-for="event in events.slice(0, 4)" :key="event.id" class="flex gap-3 px-5 py-4">
                <div class="flex size-8 shrink-0 items-center justify-center rounded-full" :class="eventTone(event.severity)">
                  <UIcon :name="eventIcon(event.severity)" class="size-4" />
                </div><div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-xs font-semibold text-highlighted">
                      {{ event.type }}
                    </p><span class="text-[10px] text-muted">{{ event.source }}</span>
                  </div><p class="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                    {{ event.message }}
                  </p>
                </div>
              </div>
            </div><div class="border-t border-default px-5 py-3">
              <UButton
                block
                variant="ghost"
                color="neutral"
                size="sm"
                label="Open event monitor"
                to="/reports"
              />
            </div>
          </UCard>
        </section>

        <section>
          <div class="mb-3 flex items-end justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-highlighted">
                Connected data sources
              </p><p class="mt-1 text-xs text-muted">
                Health and throughput across your OneVision pipeline
              </p>
            </div><UButton
              label="Manage sources"
              color="neutral"
              variant="ghost"
              to="/data"
              trailing-icon="i-lucide-arrow-up-right"
            />
          </div><UCard :ui="{ body: 'p-0' }" class="overflow-hidden">
            <div class="hidden grid-cols-[1.4fr_1fr_0.6fr_0.7fr_0.7fr] gap-4 border-b border-default bg-elevated/40 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted sm:grid">
              <span>Source</span><span>Connection</span><span>Records</span><span>Status</span><span>Last sync</span>
            </div><div v-for="source in sourceRows" :key="source.name" class="grid gap-3 border-b border-default px-5 py-4 last:border-0 sm:grid-cols-[1.4fr_1fr_0.6fr_0.7fr_0.7fr] sm:items-center sm:gap-4">
              <div class="flex items-center gap-3">
                <div class="flex size-9 items-center justify-center rounded-xl" :class="toneClasses[source.color]">
                  <UIcon :name="source.icon" class="size-4" />
                </div><div>
                  <p class="text-sm font-medium text-highlighted">
                    {{ source.name }}
                  </p><p class="text-xs text-muted sm:hidden">
                    {{ source.type }}
                  </p>
                </div>
              </div><span class="hidden text-xs text-muted sm:block">{{ source.type }}</span><span class="text-xs text-muted"><span class="mr-2 sm:hidden">Records</span>{{ source.records }}</span><span><UBadge :color="source.status === 'Healthy' ? 'success' : 'warning'" variant="subtle" size="sm">{{ source.status }}</UBadge></span><span class="text-xs text-muted">{{ source.updated }}</span>
            </div>
          </UCard>
        </section>

        <div v-if="!isConfigured" class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-cyan-300/70 bg-cyan-50/60 px-4 py-3 text-xs text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-100">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-info" class="size-4" /><span>แสดงข้อมูลตัวอย่างอยู่ในขณะนี้ ตั้งค่า <code class="rounded bg-cyan-100 px-1 py-0.5 dark:bg-cyan-900/50">NUXT_PUBLIC_ONE_VISION_WEBSOCKET_URL</code> เพื่อเปิดใช้งานข้อมูลจาก WebSocket</span>
          </div><UButton
            size="xs"
            color="primary"
            variant="soft"
            label="Preview live event"
            @click="simulateEvent"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
