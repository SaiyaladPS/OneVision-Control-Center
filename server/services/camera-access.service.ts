import prisma from '../utils/prisma'
import { listCameras } from './camera.service'

type AccessRow = {
  user_id: number
  camera_id: number
  can_view: boolean
  can_scan: boolean
}

export interface CameraAccessPermission {
  cameraId: number
  canView: boolean
  canScan: boolean
}

let accessTableReady: Promise<void> | null = null

async function ensureAccessTable() {
  if (!accessTableReady) {
    accessTableReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS camera_access (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        camera_id INTEGER NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
        can_view BOOLEAN NOT NULL DEFAULT TRUE,
        can_scan BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_camera_access_user_camera UNIQUE (user_id, camera_id)
      )
    `).then(async () => {
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS ix_camera_access_user_id ON camera_access(user_id)')
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS ix_camera_access_camera_id ON camera_access(camera_id)')
    }).catch((error) => {
      accessTableReady = null
      throw error
    })
  }
  await accessTableReady
}

async function prepareTables() {
  // The camera service also imports the legacy camera list when needed.
  await listCameras()
  await ensureAccessTable()
}

export async function getCameraAccessControl() {
  await prepareTables()

  const [users, cameras, rows] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, username: true, role: true },
      orderBy: [{ name: 'asc' }, { username: 'asc' }]
    }),
    listCameras(),
    prisma.$queryRaw<AccessRow[]>`
      SELECT user_id, camera_id, can_view, can_scan
      FROM camera_access
      ORDER BY user_id ASC, camera_id ASC
    `
  ])

  return {
    users,
    cameras,
    permissions: rows.map(row => ({
      userId: Number(row.user_id),
      cameraId: Number(row.camera_id),
      canView: Boolean(row.can_view),
      canScan: Boolean(row.can_scan)
    }))
  }
}

export async function replaceCameraAccess(userId: number, permissions: CameraAccessPermission[]) {
  await prepareTables()

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('User not found')

  const cameras = await listCameras()
  const cameraIds = new Set(cameras.map(camera => camera.id))
  const normalized = permissions.map((permission) => {
    const cameraId = Number(permission.cameraId)
    if (!Number.isSafeInteger(cameraId) || !cameraIds.has(cameraId)) {
      throw new Error('One or more cameras were not found')
    }
    return {
      cameraId,
      canView: Boolean(permission.canView),
      canScan: Boolean(permission.canView && permission.canScan)
    }
  }).filter(permission => permission.canView || permission.canScan)

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`DELETE FROM camera_access WHERE user_id = ${userId}`
    for (const permission of normalized) {
      await transaction.$executeRaw`
        INSERT INTO camera_access (user_id, camera_id, can_view, can_scan)
        VALUES (${userId}, ${permission.cameraId}, ${permission.canView}, ${permission.canScan})
        ON CONFLICT (user_id, camera_id)
        DO UPDATE SET can_view = EXCLUDED.can_view, can_scan = EXCLUDED.can_scan, updated_at = CURRENT_TIMESTAMP
      `
    }
  })

  return {
    userId,
    permissions: normalized
  }
}
