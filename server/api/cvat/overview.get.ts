import { getCvatOverview } from '../../services/cvat-data.service'

export default defineEventHandler(async () => {
  try {
    return sendSuccess(await getCvatOverview())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load CVAT data'
    return sendApiError(message, message.includes('not configured') ? 503 : 502)
  }
})
