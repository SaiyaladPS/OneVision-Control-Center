import { updateCvatConnection, type CvatConnectionInput } from '../../../services/cvat-connection.service'
import { checkRole } from '../../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN'])
  const id = Number(getRouterParam(event, 'id'))
  try {
    return sendSuccess(await updateCvatConnection(id, await readBody<CvatConnectionInput>(event)), 'CVAT connection updated')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update CVAT connection'
    throw createError({ statusCode: message.includes('not found') ? 404 : message.includes('Unique constraint') ? 409 : 400, statusMessage: message })
  }
})
