import { getCameraAccessControl } from '../../services/camera-access.service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return sendSuccess(await getCameraAccessControl())
})
