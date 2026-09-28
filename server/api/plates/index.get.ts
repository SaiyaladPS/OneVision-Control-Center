import { plateService } from '../../services/plate.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const pageSize = Math.min(Number(query.pageSize) || 10, 100)

  return sendSuccess(await plateService.getPlates({
    page,
    pageSize,
    search: query.search as string,
    confidenceLevel: query.confidenceLevel as string
  }))
})
