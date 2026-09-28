import { listCameras } from '../../services/camera.service'
import { checkRole } from '../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  return sendSuccess(await listCameras())
})
