import { replaceCameraAccess, type CameraAccessPermission } from '../../services/camera-access.service'
import { createApiError } from '../../utils/api-response'

interface RawPermission {
  cameraId?: unknown
  canView?: unknown
  canScan?: unknown
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ userId?: unknown, permissions?: unknown }>(event)
  const userId = Number(body?.userId)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'A valid user is required' })
  }
  if (!Array.isArray(body?.permissions)) {
    throw createError({ statusCode: 400, statusMessage: 'Permissions must be an array' })
  }

  const permissions = body.permissions.map((permission): CameraAccessPermission => {
    const value = permission && typeof permission === 'object' ? permission as RawPermission : {}
    return {
      cameraId: Number(value.cameraId),
      canView: Boolean(value.canView),
      canScan: Boolean(value.canScan)
    }
  })

  try {
    return sendSuccess(await replaceCameraAccess(userId, permissions), 'Camera access updated')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update camera access'
    throw createApiError(message, message === 'User not found' ? 404 : 400)
  }
})
