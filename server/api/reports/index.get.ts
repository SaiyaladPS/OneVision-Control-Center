import { plateService } from '../../services/plate.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Number(query.limit) || 50
  const reports = await plateService.getReports(limit)

  return sendSuccess({
    reports,
    total: reports.length,
    generatedAt: new Date().toISOString()
  })
})
