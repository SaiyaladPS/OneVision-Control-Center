import { deleteDatasetRecords } from '../../services/dataset.service'
import { checkRole } from '../../utils/rbac'

export default defineEventHandler(async (event) => {
  await checkRole(event, ['ADMIN', 'EDITOR'])
  const body = await readBody<{ ids?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : []

  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: 'Select at least one dataset record to delete' })
  }
  if (ids.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'You can delete up to 100 records at a time' })
  }

  return sendSuccess(await deleteDatasetRecords(ids), 'Dataset records and associated images deleted')
})
