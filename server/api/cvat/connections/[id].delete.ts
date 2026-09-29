import { deleteCvatConnection } from '../../../services/cvat-connection.service'
import { checkRole } from '../../../utils/rbac'
import { createApiError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  const id = Number(getRouterParam(event, 'id'))
  try {
    return sendSuccess(await deleteCvatConnection(id), 'CVAT connection deleted')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete CVAT connection'
    throw createApiError(message, message.includes('not found') ? 404 : 400)
  }
})
