import { getPlateImage } from '../../services/plate.service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = String(query.id || '')
  const requestedVariant = String(query.variant || 'full')
  const variant = requestedVariant === 'crop' || requestedVariant === 'ocr' ? requestedVariant : 'full'
  const image = await getPlateImage(id, variant)

  if (!image) {
    throw createError({ statusCode: 404, statusMessage: 'Plate image not found' })
  }

  const contentTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  }
  setHeader(event, 'Content-Type', contentTypes[image.extension] || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return image.content
})
