import { getDatasetImage } from '../../services/dataset.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = String(query.id || '')
  const variant = String(query.variant || 'full')
  const image = await getDatasetImage(id, variant)
  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Dataset image not found' })
  }
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  }
  setHeader(event, 'Content-Type', contentTypes[image.extension] || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return image.content
})
