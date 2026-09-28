import { deleteCamera } from '../../services/camera.service'
import { checkRole } from '../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  const id = Number(getRouterParam(event, 'id'))
  try {
    return sendSuccess(await deleteCamera(id), 'CCTV camera deleted')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete CCTV camera'
    throw createError({ statusCode: message.includes('Record to delete does not exist') ? 404 : 400, statusMessage: message })
  }
})
