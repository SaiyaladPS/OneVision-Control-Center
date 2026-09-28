import { plateService } from '../../services/plate.service'

export default defineEventHandler(async () => {
  return sendSuccess(await plateService.getOverview())
})
