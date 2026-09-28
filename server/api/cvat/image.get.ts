import { getCvatImage } from '../../services/cvat-data.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const image = await getCvatImage(Number(query.taskId), Number(query.frame))
  if (!image) throw createError({ statusCode: 404, statusMessage: 'CVAT image not found' })
  setHeader(event, 'Content-Type', image.contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return image.content
})
