import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize } from 'node:path'
import prisma from '../utils/prisma'

function dataRoot() {
  return process.env.ONEVISION_DATA_ROOT || 'D:\\project\\OneVison\\scan\\data'
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function imageCandidates(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return []
  const text = value.trim().replace(/^file:\/\//i, '')
  const root = dataRoot()
  const marker = text.toLowerCase().lastIndexOf('scan\\data\\')
  const relative = marker >= 0 ? text.slice(marker + 'scan\\data\\'.length) : text
  return [
    ...(isAbsolute(text) ? [normalize(text)] : []),
    join(root, relative),
    join(root, text)
  ]
}

function resolveImagePath(...values: unknown[]) {
  return [...new Set(values.flatMap(imageCandidates))].find(path => existsSync(path)) || null
}

function imageValue(plate: Record<string, unknown>, field: string, rawField: string) {
  const rawPlate = asObject(plate.rawPlate)
  return plate[field] || rawPlate[rawField] || asObject(rawPlate.plate)[rawField]
}

function plateBoundingBox(rawPlate: unknown) {
  const raw = asObject(rawPlate)
  const nested = asObject(raw.plate)
  const value = raw.box || raw.bbox || nested.box || nested.bbox
  return Array.isArray(value) && value.length === 4
    ? value.slice(0, 4).map(Number)
    : null
}

function modelCountryKey(country: string) {
  return country.toLowerCase() === 'lao' || country.toLowerCase() === 'laos' ? 'lao' : 'thai'
}

function plateModelTokens(rawPlate: unknown, country: string) {
  const raw = asObject(rawPlate)
  const readings = asObject(raw.country_readings)
  const countryKey = modelCountryKey(country)
  const reading = asObject(readings[countryKey])
  const tokens = Array.isArray(reading.tokens) ? reading.tokens : []
  return tokens.map((token) => {
    const value = asObject(token)
    const box = value.box
    return {
      label: String(value.label || ''),
      kind: String(value.kind || 'character'),
      confidence: Number(value.confidence) || 0,
      box: Array.isArray(box) ? box.slice(0, 4).map(Number) : []
    }
  }).filter(token => token.box.length === 4 && token.label)
}

function plateModelName(rawPlate: unknown, country: string) {
  const raw = asObject(rawPlate)
  const ocr = asObject(raw.ocr)
  const countryKey = modelCountryKey(country)
  return String(ocr.model_primary || `${countryKey}_license_plate`)
}

async function readSourcePlate(rawPlate: unknown, vehicleImage: unknown) {
  const raw = asObject(rawPlate)
  const imageValue = raw.full_vehicle_image || vehicleImage
  if (typeof imageValue !== 'string') return {}
  const match = imageValue.replace(/^file:\/\//i, '').match(/(?:^|[\\/])(\d{8})[\\/](?:thai|laos)[\\/](.+)$/i)
  if (!match) return {}
  const [, date, relativeImage] = match
  if (!date || !relativeImage) return {}
  const imageName = basename(relativeImage)
  const jsonName = imageName
    .replace(/-rejected-full_vehicle\.[^.]+$/i, '_rejected_plate.json')
    .replace(/-full_vehicle\.[^.]+$/i, '_plate.json')
  if (jsonName === imageName) return {}
  try {
    return JSON.parse(await readFile(join(dataRoot(), date, 'json', jsonName), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function plateModelAnnotations(rawPlate: unknown, country: string, vehicleImage: unknown) {
  const currentTokens = plateModelTokens(rawPlate, country)
  if (currentTokens.length) {
    return { modelPrimary: plateModelName(rawPlate, country), tokenBoxes: currentTokens }
  }
  const sourcePlate = await readSourcePlate(rawPlate, vehicleImage)
  return {
    modelPrimary: plateModelName(sourcePlate, country),
    tokenBoxes: plateModelTokens(sourcePlate, country)
  }
}

export async function getPlateImage(id: string, variant: 'full' | 'crop' | 'ocr' = 'full') {
  if (!/^\d+$/.test(id)) return null
  const plate = await prisma.plate.findUnique({
    where: { id: BigInt(id) },
    select: { vehicleImage: true, cropImage: true, ocrReadyImage: true, rawPlate: true }
  })
  if (!plate) return null
  const imagePath = variant === 'crop'
    ? resolveImagePath(imageValue(plate, 'cropImage', 'crop_image'))
    : variant === 'ocr'
      ? resolveImagePath(imageValue(plate, 'ocrReadyImage', 'ocr_ready_image'))
      : resolveImagePath(imageValue(plate, 'vehicleImage', 'full_vehicle_image'))
  if (!imagePath) return null
  const { readFile } = await import('node:fs/promises')
  return { content: await readFile(imagePath), extension: imagePath.toLowerCase().split('.').pop() || 'jpg' }
}

export class PlateService {
  async getReports(limit = 50) {
    const rows = await prisma.scanRun.findMany({
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: { scannedAt: 'desc' }
    })

    return rows.map((scan) => {
      const type = scan.mediaType === 'camera' ? 'Camera' : scan.mediaType === 'video' ? 'Video' : 'Image'
      const plateCount = scan.plateCount || 0
      return {
        id: `RPT-${scan.id.toString().padStart(6, '0')}`,
        scanId: scan.id.toString(),
        name: `${type} inspection report`,
        description: `${plateCount.toLocaleString()} detected plate${plateCount === 1 ? '' : 's'} from OneVision`,
        type: 'Data quality',
        owner: scan.operatorName || scan.operatorUsername || 'System',
        updated: scan.scannedAt.toISOString(),
        status: 'Ready',
        plateCount,
        mediaType: scan.mediaType || 'image'
      }
    })
  }

  async getPlates(params: { page: number, pageSize: number, search?: string, confidenceLevel?: string }) {
    const { page, pageSize, search, confidenceLevel } = params
    const where = {
      ...(search
        ? {
            OR: [
              { plateNumber: { contains: search } },
              { ocrText: { contains: search } },
              { province: { contains: search } },
              { vehicleType: { contains: search } },
              { country: { contains: search } }
            ]
          }
        : {}),
      ...(confidenceLevel && confidenceLevel !== 'all' ? { confidenceLevel } : {})
    }

    const [data, total] = await Promise.all([
      prisma.plate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
        select: {
          id: true,
          scanId: true,
          country: true,
          province: true,
          plateNumber: true,
          ocrText: true,
          confidenceLevel: true,
          overallConfidence: true,
          recognitionConfidence: true,
          vehicleType: true,
          plateType: true,
          vehicleImage: true,
          cropImage: true,
          ocrReadyImage: true,
          rawPlate: true
        }
      }),
      prisma.plate.count({ where })
    ])

    return {
      data: await Promise.all(data.map(async ({ vehicleImage: _vehicleImage, cropImage: _cropImage, ocrReadyImage: _ocrReadyImage, rawPlate, ...plate }) => {
        const annotations = await plateModelAnnotations(rawPlate, plate.country, _vehicleImage)
        return {
          ...plate,
          id: plate.id.toString(),
          scanId: plate.scanId.toString(),
          hasVehicleImage: Boolean(_vehicleImage),
          hasCropImage: Boolean(_cropImage || _ocrReadyImage),
          box: plateBoundingBox(rawPlate),
          ...annotations
        }
      })),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }
  }

  async getOverview() {
    const [plates, scans, operators, confidence] = await Promise.all([
      prisma.plate.count(),
      prisma.scanRun.count(),
      prisma.scanRun.findMany({ distinct: ['operatorUsername'], where: { operatorUsername: { not: null } }, select: { operatorUsername: true } }),
      prisma.plate.aggregate({ _avg: { overallConfidence: true } })
    ])

    return {
      plates,
      scans,
      operators: operators.length,
      averageConfidence: Number(((confidence._avg.overallConfidence || 0) * 100).toFixed(1))
    }
  }
}

export const plateService = new PlateService()
