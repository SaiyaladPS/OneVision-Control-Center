import { updateCamera, type CameraInput } from '../../services/camera.service'
import { checkRole } from '../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  const id = Number(getRouterParam(event, 'id'))
  try {
    return sendSuccess(await updateCamera(id, await readBody<CameraInput>(event)), 'CCTV camera updated')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update CCTV camera'
    throw createError({ statusCode: message.includes('not found') ? 404 : message.includes('Unique constraint') ? 409 : 400, statusMessage: message })
  }
})
