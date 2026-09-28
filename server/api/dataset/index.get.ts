import { datasetFilterFromQuery, getDataset } from '../../services/dataset.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  return sendSuccess(await getDataset(datasetFilterFromQuery(query as Record<string, unknown>), page, pageSize))
})
