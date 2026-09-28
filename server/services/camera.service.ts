import prisma from '../utils/prisma'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

let cameraTableReady: Promise<void> | null = null
let legacyImportDone = false

async function ensureCameraTable() {
  if (!cameraTableReady) {
    cameraTableReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS cameras (
        id SERIAL PRIMARY KEY,
        host TEXT NOT NULL UNIQUE,
        stream_url TEXT,
        label TEXT,
        kind TEXT NOT NULL DEFAULT 'ip',
        device_index INTEGER,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(async () => {
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS ix_cameras_enabled ON cameras (enabled)')
    }).catch((error) => {
      cameraTableReady = null
      throw error
    })
  }
  await cameraTableReady
}

function loadLegacyEnv(filePath: string) {
  const values: Record<string, string> = {}
  if (!existsSync(filePath)) return values
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    if (!key) continue
    values[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

function legacyCameraSources() {
  const projectRoot = resolve(process.cwd())
  const candidateRoots = [
    process.env.ONEVISION_CAR_SCAN_ROOT,
    process.env.CAR_SCAN_ROOT,
    resolve(projectRoot, '..', 'OneVison'),
    resolve(projectRoot, '..', 'OneVision')
  ].filter(Boolean).map(value => resolve(String(value)))
  const roots = [...new Set(candidateRoots)]
  const envValues = roots.reduce<Record<string, string>>((all, root) => ({
    ...all,
    ...loadLegacyEnv(join(root, '.env'))
  }), {})
  const urls = [envValues.CAR_SCAN_IP_CAMERA_URL, envValues.CAR_SCAN_IP_CAMERA_URLS]
    .flatMap(value => String(value || '').split(/[\r\n,]+/))
    .map(value => value.trim())
    .filter(Boolean)
  const byHost = new Map<string, { host: string, streamUrl: string, label: string, kind: string, deviceIndex: number | null }>()
  const add = (host: string, streamUrl: string, label = '') => {
    const normalizedHost = host.trim()
    if (!normalizedHost || !streamUrl.trim()) return
    let parsed: URL
    try {
      parsed = new URL(streamUrl)
    } catch {
      return
    }
    const local = parsed.protocol === 'local:'
    const key = normalizedHost.toLowerCase()
    byHost.set(key, {
      host: normalizedHost,
      streamUrl: parsed.toString(),
      label: label.trim(),
      kind: local ? 'local' : 'ip',
      deviceIndex: local ? Number(parsed.hostname || parsed.pathname.replace(/^\//, '') || 0) : null
    })
  }
  for (const url of urls) {
    try {
      const parsed = new URL(url)
      add(parsed.hostname || parsed.pathname, url)
    } catch {
      // Ignore malformed legacy entries; the settings page can add them again.
    }
  }
  for (const root of roots) {
    const jsonPath = join(root, 'scan', 'data', 'ip_cameras.json')
    if (!existsSync(jsonPath)) continue
    try {
      const payload = JSON.parse(readFileSync(jsonPath, 'utf8'))
      for (const item of Array.isArray(payload?.cameras) ? payload.cameras : []) {
        const streamUrl = String(item?.url || '').trim()
        const host = String(item?.host || '').trim()
        if (!streamUrl || !host) continue
        add(host, streamUrl, String(item?.label || ''))
      }
    } catch {
      // Keep the page usable when an old settings file is incomplete.
    }
  }
  return [...byHost.values()]
}

async function importLegacyCamerasIfNeeded() {
  if (legacyImportDone) return
  legacyImportDone = true
  if (await prisma.camera.count() > 0) return
  for (const camera of legacyCameraSources()) {
    await prisma.camera.create({ data: camera }).catch((error: unknown) => {
      const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      if (!message.includes('Unique constraint')) throw error
    })
  }
}

export interface CameraInput {
  host?: unknown
  label?: unknown
  streamUrl?: unknown
  username?: unknown
  password?: unknown
  kind?: unknown
  deviceIndex?: unknown
  enabled?: unknown
}

interface CameraRecord {
  id: number
  host: string
  streamUrl: string | null
  label: string | null
  kind: string
  deviceIndex: number | null
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function cleanText(value: unknown, label: string, required = false) {
  const text = String(value ?? '').trim()
  if (required && !text) throw new Error(`${label} is required`)
  return text
}

function cameraHost(value: string) {
  const text = value.trim()
  if (!text) throw new Error('Camera host is required')
  if (text.length > 255 || /[\s/]/.test(text)) throw new Error('Camera host must be an IP address or hostname')
  return text
}

function validStreamUrl(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const candidate = raw.includes('://') ? raw : `rtsp://${raw}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('RTSP URL is invalid')
  }
  if (!['rtsp:', 'rtsps:', 'http:', 'https:', 'local:'].includes(parsed.protocol)) {
    throw new Error('Camera URL must use RTSP, HTTP, HTTPS, or local protocol')
  }
  return parsed.toString()
}

function redactStreamUrl(value: string | null) {
  if (!value) return ''
  try {
    const parsed = new URL(value)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return value
  }
}

function publicCamera(camera: CameraRecord) {
  const streamUrl = String(camera.streamUrl || '')
  return {
    id: camera.id,
    host: camera.host,
    label: camera.label || '',
    kind: camera.kind || 'ip',
    deviceIndex: camera.deviceIndex,
    enabled: camera.enabled,
    streamUrl: redactStreamUrl(streamUrl),
    hasCredentials: Boolean(streamUrl && (() => {
      try {
        const parsed = new URL(streamUrl)
        return Boolean(parsed.username || parsed.password)
      } catch {
        return false
      }
    })()),
    createdAt: camera.createdAt,
    updatedAt: camera.updatedAt
  }
}

function cameraData(input: CameraInput, existing?: Pick<CameraRecord, 'streamUrl' | 'enabled'>) {
  const host = cameraHost(cleanText(input.host, 'Camera host', true))
  const label = cleanText(input.label, 'Camera name')
  if (label.length > 80) throw new Error('Camera name must be 80 characters or fewer')
  const kind = cleanText(input.kind, 'Camera type') || 'ip'
  const deviceIndexRaw = input.deviceIndex
  const deviceIndex = deviceIndexRaw === undefined || deviceIndexRaw === null || deviceIndexRaw === ''
    ? null
    : Number(deviceIndexRaw)
  if (deviceIndex !== null && (!Number.isInteger(deviceIndex) || deviceIndex < 0 || deviceIndex > 99)) {
    throw new Error('Camera index must be a whole number from 0 to 99')
  }

  const username = cleanText(input.username, 'Camera username')
  const password = String(input.password ?? '')
  const suppliedUrl = cleanText(input.streamUrl, 'RTSP URL')
  let streamUrl = suppliedUrl
    ? validStreamUrl(suppliedUrl)
    : String(existing?.streamUrl || `rtsp://${host}:554/Streaming/Channels/101`)
  streamUrl = validStreamUrl(streamUrl)
  const parsed = new URL(streamUrl)
  const oldParsed = existing?.streamUrl ? new URL(existing.streamUrl) : null
  if (username || password) {
    parsed.username = username
    parsed.password = password
  } else if (oldParsed && !parsed.username && !parsed.password && oldParsed.hostname === parsed.hostname) {
    parsed.username = oldParsed.username
    parsed.password = oldParsed.password
  }

  return {
    host,
    label: label || null,
    streamUrl: parsed.toString(),
    kind,
    deviceIndex,
    enabled: input.enabled === undefined ? (existing?.enabled ?? true) : Boolean(input.enabled)
  }
}

export async function listCameras() {
  await ensureCameraTable()
  await importLegacyCamerasIfNeeded()
  const cameras = await prisma.camera.findMany({ orderBy: [{ enabled: 'desc' }, { label: 'asc' }, { host: 'asc' }] })
  return cameras.map(publicCamera)
}

export async function createCamera(input: CameraInput) {
  await ensureCameraTable()
  const data = cameraData(input)
  const camera = await prisma.camera.create({ data })
  return publicCamera(camera)
}

export async function updateCamera(id: number, input: CameraInput) {
  await ensureCameraTable()
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid camera ID')
  const existing = await prisma.camera.findUnique({ where: { id } })
  if (!existing) throw new Error('Camera not found')
  const data = cameraData({ ...input, host: input.host ?? existing.host }, existing)
  const camera = await prisma.camera.update({ where: { id }, data })
  return publicCamera(camera)
}

export async function deleteCamera(id: number) {
  await ensureCameraTable()
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid camera ID')
  await prisma.camera.delete({ where: { id } })
  return { id }
}
