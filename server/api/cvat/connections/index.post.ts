import { createCvatConnection, type CvatConnectionInput } from '../../../services/cvat-connection.service'
import { checkRole } from '../../../utils/rbac'
import { createApiError } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  try {
    return sendSuccess(await createCvatConnection(await readBody<CvatConnectionInput>(event)), 'CVAT connection created')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create CVAT connection'
    throw createApiError(message, message.includes('Unique constraint') ? 409 : 400)
  }
})
