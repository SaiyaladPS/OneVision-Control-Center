import { createCamera, type CameraInput } from '../../services/camera.service'
import { checkRole } from '../../utils/rbac'
import { createApiError } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  try {
    return sendSuccess(await createCamera(await readBody<CameraInput>(event)), 'CCTV camera created')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create CCTV camera'
    throw createApiError(message, message.includes('Unique constraint') ? 409 : 400)
  }
})
