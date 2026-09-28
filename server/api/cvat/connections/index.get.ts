import { listCvatConnections } from '../../../services/cvat-connection.service'
import { checkRole } from '../../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  return sendSuccess(await listCvatConnections())
})
