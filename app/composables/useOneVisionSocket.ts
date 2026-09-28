import { createSharedComposable } from '@vueuse/core'

export type OneVisionConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface OneVisionEvent {
  id: string
  type: string
  source: string
  message: string
  timestamp: string
  severity: 'info' | 'success' | 'warning' | 'error'
  data?: Record<string, unknown>
}

const seedEvents: OneVisionEvent[] = [
  {
    id: 'evt-1004',
    type: 'SYNC_COMPLETE',
    source: 'Inventory Service',
    message: 'Inventory snapshot synchronized successfully',
    timestamp: '2026-09-24T09:42:00+07:00',
    severity: 'success'
  },
  {
    id: 'evt-1003',
    type: 'DATA_INGESTED',
    source: 'Order Gateway',
    message: '184 new records received from the order stream',
    timestamp: '2026-09-24T09:39:00+07:00',
    severity: 'info'
  },
  {
    id: 'evt-1002',
    type: 'VALIDATION_WARN',
    source: 'Customer API',
    message: '12 records need address validation',
    timestamp: '2026-09-24T09:32:00+07:00',
    severity: 'warning'
  },
  {
    id: 'evt-1001',
    type: 'REPORT_READY',
    source: 'Reporting Engine',
    message: 'Weekly operations report is ready to review',
    timestamp: '2026-09-24T09:18:00+07:00',
    severity: 'info'
  }
]

function normalizeEvent(payload: unknown): OneVisionEvent {
  const value = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
  const nestedData = typeof value.data === 'object' && value.data !== null ? value.data as Record<string, unknown> : {}

  return {
    id: String(value.id || `evt-${Date.now()}`),
    type: String(value.type || value.event || 'SYSTEM_EVENT'),
    source: String(value.source || value.service || 'OneVision'),
    message: String(value.message || nestedData.message || 'New event received'),
    timestamp: String(value.timestamp || value.createdAt || new Date().toISOString()),
    severity: ['success', 'warning', 'error'].includes(String(value.severity)) ? String(value.severity) as OneVisionEvent['severity'] : 'info',
    data: typeof value.data === 'object' && value.data !== null ? value.data as Record<string, unknown> : undefined
  }
}

const _useOneVisionSocket = () => {
  const config = useRuntimeConfig()
  const socket = shallowRef<WebSocket | null>(null)
  const connectionState = ref<OneVisionConnectionState>('idle')
  const events = ref<OneVisionEvent[]>([...seedEvents])
  const lastEvent = shallowRef<OneVisionEvent | null>(null)
  const lastMessageAt = ref<string | null>(seedEvents[0]?.timestamp || null)
  const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnect = ref(true)

  const socketUrl = computed(() => {
    const configuredUrl = String(config.public.oneVisionWebSocketUrl || '').trim()
    if (!import.meta.client || !window.location.hostname) return configuredUrl

    if (configuredUrl) {
      try {
        const configured = new URL(configuredUrl)
        const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
        const browserIsLocal = localHosts.has(window.location.hostname)
        if (!localHosts.has(configured.hostname) || browserIsLocal) return configuredUrl
        const port = configured.port || '8000'
        return `${configured.protocol}//${window.location.hostname}:${port}${configured.pathname || '/ws'}`
      } catch {
        return configuredUrl
      }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.hostname}:8000/ws`
  })
  const isConfigured = computed(() => Boolean(socketUrl.value))
  const isConnected = computed(() => connectionState.value === 'connected')

  function pushEvent(payload: unknown) {
    const event = normalizeEvent(payload)
    events.value = [event, ...events.value.filter(item => item.id !== event.id)].slice(0, 20)
    lastMessageAt.value = event.timestamp
    lastEvent.value = event
  }

  function scheduleReconnect() {
    if (!shouldReconnect.value || reconnectTimer.value || !socketUrl.value) return
    reconnectTimer.value = setTimeout(() => {
      reconnectTimer.value = null
      connect()
    }, 5000)
  }

  function connect() {
    if (import.meta.server || !socketUrl.value || socket.value?.readyState === WebSocket.OPEN || socket.value?.readyState === WebSocket.CONNECTING) {
      if (!socketUrl.value) connectionState.value = 'disconnected'
      return
    }

    shouldReconnect.value = true
    connectionState.value = 'connecting'

    try {
      const currentSocket = new WebSocket(socketUrl.value)
      socket.value = currentSocket

      currentSocket.onopen = () => {
        connectionState.value = 'connected'
      }
      currentSocket.onmessage = (message) => {
        try {
          pushEvent(JSON.parse(message.data))
        } catch {
          pushEvent({ message: String(message.data) })
        }
      }
      currentSocket.onerror = () => {
        connectionState.value = 'error'
      }
      currentSocket.onclose = () => {
        socket.value = null
        connectionState.value = 'disconnected'
        scheduleReconnect()
      }
    } catch {
      connectionState.value = 'error'
      scheduleReconnect()
    }
  }

  function disconnect() {
    shouldReconnect.value = false
    if (reconnectTimer.value) clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null
    socket.value?.close()
    socket.value = null
    connectionState.value = 'disconnected'
  }

  function send(payload: unknown) {
    if (socket.value?.readyState === WebSocket.OPEN) {
      socket.value.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  onMounted(connect)
  onUnmounted(disconnect)

  return {
    socketUrl,
    isConfigured,
    isConnected,
    connectionState,
    events,
    lastEvent,
    lastMessageAt,
    connect,
    disconnect,
    send,
    pushEvent
  }
}

export const useOneVisionSocket = createSharedComposable(_useOneVisionSocket)
