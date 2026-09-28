import { exportDataset, datasetFilterFromQuery } from '../../services/dataset.service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ ids?: string[], filters?: Record<string, string> }>(event)
  const filters = body?.filters ? datasetFilterFromQuery(body.filters) : {}
  const result = await exportDataset(filters, Array.isArray(body?.ids) ? body.ids : [])
  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${result.archiveName}"`)
  setHeader(event, 'X-OneVision-Selected', String(result.selectedCount))
  setHeader(event, 'X-OneVision-Exported', String(result.exportedCount))
  setHeader(event, 'X-OneVision-Skipped', String(result.skippedCount))
  return result.archive
})
