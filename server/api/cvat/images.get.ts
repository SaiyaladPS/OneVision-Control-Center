import { getCvatImageReport } from '../../services/cvat-data.service'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    return sendSuccess(await getCvatImageReport({
      search: String(query.search || ''),
      projectId: String(query.projectId || 'all'),
      taskId: String(query.taskId || 'all'),
      label: String(query.label || 'all'),
      status: String(query.status || 'all'),
      jobStatus: String(query.jobStatus || 'all'),
      jobSearch: String(query.jobSearch || ''),
      box: String(query.box || 'all')
    }, Number(query.page) || 1, Number(query.pageSize) || 24))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load CVAT images'
    return sendApiError(message, message.includes('not configured') ? 503 : 502)
  }
})
