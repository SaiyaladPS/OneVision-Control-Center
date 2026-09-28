import { updateDatasetRecord, type DatasetEditInput } from '../../services/dataset.service'
import { checkRole } from '../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN', 'EDITOR'])
  const body = await readBody<{ id?: unknown, changes?: DatasetEditInput }>(event)
  const id = String(body?.id || '').trim()
  if (!id || !body?.changes || typeof body.changes !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Dataset record and changes are required' })
  }

  const session = await getUserSession(event)
  const sessionUser = session.user as unknown as { id?: number } | undefined
  const updatedBy = Number(sessionUser?.id) || undefined
  try {
    return sendSuccess(await updateDatasetRecord(id, body.changes, updatedBy), 'Dataset record updated')
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Could not update dataset record' })
  }
})
