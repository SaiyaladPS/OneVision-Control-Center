import { access, mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'

export type DatasetStatus = 'PASS' | 'REVIEW' | 'REJECT'
type JsonObject = Record<string, unknown>

export interface DatasetFilters {
  date?: string
  country?: string
  status?: string
  search?: string
}

export interface DatasetEditInput {
  country?: string
  province?: string
  platePrefix?: string
  plateNumber?: string
  status?: DatasetStatus
  box?: number[] | null
}

export interface DatasetRecord {
  id: string
  date: string
  filename: string
  country: 'thai' | 'laos'
  status: DatasetStatus
  plateText: string
  platePrefix: string
  plateNumber: string
  province: string
  confidence: number
  qcReasons: string[]
  sourceImage: string
  sourceExists: boolean
  labelReady: boolean
  box: number[] | null
  imageWidth: number | null
  imageHeight: number | null
  cropWidth: number | null
  cropHeight: number | null
  ocrWidth: number | null
  ocrHeight: number | null
  ocrImageExists: boolean
  tokenBoxes: Array<{ label: string, kind: string, confidence: number, box: number[] }>
  fileSize: number
  updatedAt: string
}

interface LoadedRecord extends DatasetRecord {
  imagePath: string
}

interface ZipEntry {
  name: string
  content: Buffer
}

const DATE_PATTERN = /^\d{8}$/
function dataRoot() {
  const configured = process.env.ONEVISION_DATA_ROOT || process.env.CAR_SCAN_OUTPUT_DIR
  return resolve(configured || join(process.cwd(), '..', 'OneVison', 'scan', 'data'))
}

function normalizeStatus(value: unknown, qc: Record<string, unknown>) {
  const explicit = String(value || '').toUpperCase()
  if (explicit === 'PASS' || explicit === 'REJECT' || explicit === 'REVIEW') return explicit
  const qcStatus = String(qc.status || '').toUpperCase()
  return qcStatus === 'PASS' ? 'PASS' : qcStatus === 'REJECT' ? 'REJECT' : 'REVIEW'
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function plateText(payload: JsonObject) {
  const plate = asObject(payload.plate)
  const ocr = asObject(payload.ocr)
  const prefix = payload.plate_prefix ?? plate.prefix ?? ''
  const number = payload.plate_number ?? plate.number ?? ''
  return String(ocr.text || plate.text || [prefix, number].filter(Boolean).join('-') || 'Unrecognized')
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function isWithinRoot(path: string, root: string) {
  const relativePath = relative(resolve(root), resolve(path))
  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
}

function datasetMediaCandidates(rawPath: unknown, root: string, date: string, country: string) {
  const raw = String(rawPath || '').trim()
  return [
    raw && (isAbsolute(raw) ? raw : resolve(root, raw)),
    raw && join(root, date, country, basename(raw)),
    raw && join(root, date, country === 'laos' ? 'laos' : 'thai', basename(raw))
  ]
    .filter(Boolean)
    .map(candidate => resolve(String(candidate)))
    .filter(candidate => isWithinRoot(candidate, root))
}

async function resolveImagePath(rawPath: unknown, root: string, date: string, country: string) {
  const candidates = datasetMediaCandidates(rawPath, root, date, country)
  for (const candidate of candidates) {
    if (await exists(candidate)) return resolve(candidate)
  }
  return candidates[1] || candidates[0] || ''
}

async function readImageMetadata(imagePath: string) {
  if (!(await exists(imagePath))) return { dimensions: null, fileSize: 0 }
  const imageStat = await stat(imagePath)
  const handle = await open(imagePath, 'r')
  try {
    const header = Buffer.alloc(256 * 1024)
    const result = await handle.read(header, 0, header.length, 0)
    return { dimensions: imageDimensions(header.subarray(0, result.bytesRead)), fileSize: imageStat.size }
  } finally {
    await handle.close()
  }
}

function imageDimensions(buffer: Buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1] ?? 0
    const length = buffer.readUInt16BE(offset + 2)
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    if (!length) break
    offset += length + 2
  }
  return null
}

async function readRecord(root: string, date: string, filename: string): Promise<LoadedRecord | null> {
  const jsonPath = join(root, date, 'json', filename)
  try {
    const payload = JSON.parse(await readFile(jsonPath, 'utf8')) as JsonObject
    const plate = asObject(payload.plate)
    const dataset = asObject(payload.dataset)
    const countryValue = String(payload.country || plate.country || 'thai').toLowerCase()
    const country = countryValue === 'lao' || countryValue === 'laos' ? 'laos' : 'thai'
    const qc = asObject(payload.qc)
    const derivedImage = filename.endsWith('_rejected_plate.json')
      ? filename.replace(/_rejected_plate\.json$/, '-rejected-full_vehicle.jpg')
      : filename.replace(/_plate\.json$/, '-full_vehicle.jpg')
    const imagePath = await resolveImagePath(payload.full_vehicle_image || plate.full_vehicle_image || derivedImage, root, date, country)
    const sourceExists = await exists(imagePath)
    const imageMetadata = await readImageMetadata(imagePath)
    const dimensions = imageMetadata.dimensions
    const fileSize = imageMetadata.fileSize
    const derivedCrop = filename.endsWith('_rejected_plate.json')
      ? filename.replace(/_rejected_plate\.json$/, '-rejected-plate_crops.jpg')
      : filename.replace(/_plate\.json$/, '-plate_crops.jpg')
    const cropPath = await resolveImagePath(payload.crop_image || plate.crop_image || derivedCrop, root, date, country)
    const cropMetadata = await readImageMetadata(cropPath)
    const derivedOcr = filename.endsWith('_rejected_plate.json')
      ? filename.replace(/_rejected_plate\.json$/, '-rejected-ocr_ready.jpg')
      : filename.replace(/_plate\.json$/, '-ocr_ready.jpg')
    const ocrPath = await resolveImagePath(payload.ocr_ready_image || plate.ocr_ready_image || derivedOcr, root, date, country)
    const ocrMetadata = await readImageMetadata(ocrPath)
    const readings = asObject(payload.country_readings)
    const reading = asObject(readings[country === 'laos' ? 'lao' : 'thai'])
    const tokenBoxes = Array.isArray(reading.tokens)
      ? reading.tokens.map((token) => {
          const value = asObject(token)
          const boxValue = value.box
          return {
            label: String(value.label || ''),
            kind: String(value.kind || 'character'),
            confidence: asNumber(value.confidence),
            box: Array.isArray(boxValue) ? boxValue.slice(0, 4).map(asNumber) : []
          }
        }).filter(token => token.box.length === 4 && token.label)
      : []
    const boxValue = payload.box || plate.bbox
    const box = Array.isArray(boxValue) && boxValue.length === 4 ? boxValue.map(asNumber) : null
    const labelReady = Boolean(sourceExists && dimensions && box && (box[2] ?? 0) > (box[0] ?? 0) && (box[3] ?? 0) > (box[1] ?? 0))
    const relativeImage = imagePath ? relative(root, imagePath).split(sep).join('/') : ''
    const status = normalizeStatus(dataset.export_status || payload.training_status, qc) as DatasetStatus
    const reasons = Array.isArray(qc.reason) ? qc.reason.map(String) : []
    return {
      id: `${date}/${filename}`,
      date,
      filename,
      country,
      status,
      plateText: plateText(payload),
      platePrefix: String(payload.plate_prefix || plate.plate_prefix || ''),
      plateNumber: String(payload.plate_number || plate.plate_number || ''),
      province: String(payload.province || plate.province || ''),
      confidence: asNumber(payload.overall_confidence ?? plate.overall_confidence ?? payload.recognition_confidence),
      qcReasons: reasons,
      sourceImage: relativeImage,
      sourceExists,
      labelReady,
      box,
      imageWidth: dimensions?.width || null,
      imageHeight: dimensions?.height || null,
      cropWidth: cropMetadata.dimensions?.width || null,
      cropHeight: cropMetadata.dimensions?.height || null,
      ocrWidth: ocrMetadata.dimensions?.width || null,
      ocrHeight: ocrMetadata.dimensions?.height || null,
      ocrImageExists: Boolean(ocrMetadata.dimensions),
      tokenBoxes,
      fileSize,
      updatedAt: (await stat(jsonPath)).mtime.toISOString(),
      imagePath
    }
  } catch {
    return null
  }
}

async function allRecords() {
  const root = dataRoot()
  const dates = (await readdir(root, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory() && DATE_PATTERN.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse()
  const records: LoadedRecord[] = []
  for (const date of dates) {
    const files = (await readdir(join(root, date, 'json'), { withFileTypes: true }).catch(() => []))
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.json')
      .map(entry => entry.name)
    const loaded = await Promise.all(files.map(filename => readRecord(root, date, filename)))
    records.push(...loaded.filter(Boolean) as LoadedRecord[])
  }
  return { root, records }
}

async function applyStoredAnnotations(records: LoadedRecord[]): Promise<LoadedRecord[]> {
  if (!records.length) return records
  try {
    const edits = await prisma.datasetAnnotation.findMany({
      where: { datasetId: { in: records.map(record => record.id) } }
    })
    const byId = new Map(edits.map(edit => [edit.datasetId, edit]))
    return records.map((record) => {
      const edit = byId.get(record.id)
      if (!edit) return record
      const prefix = edit.platePrefix ?? ''
      const number = edit.plateNumber ?? ''
      return {
        ...record,
        country: (edit.country === 'laos' ? 'laos' : 'thai') as LoadedRecord['country'],
        platePrefix: edit.platePrefix ?? '',
        plateNumber: edit.plateNumber ?? '',
        province: edit.province ?? '',
        plateText: [prefix, number].filter(Boolean).join('-') || 'Unrecognized',
        status: normalizeStatus(edit.status, {}) as DatasetStatus,
        box: edit.box === null ? null : Array.isArray(edit.box) ? edit.box.map(Number) : record.box
      }
    })
  } catch {
    // Dataset browsing remains available when the optional edit table is not migrated yet.
    return records
  }
}

function matches(record: DatasetRecord, filters: DatasetFilters) {
  const query = String(filters.search || '').trim().toLowerCase()
  return (!filters.date || filters.date === 'all' || record.date === filters.date)
    && (!filters.country || filters.country === 'all' || record.country === filters.country)
    && (!filters.status || filters.status === 'all' || record.status === filters.status)
    && (!query || `${record.plateText} ${record.province} ${record.filename} ${record.date}`.toLowerCase().includes(query))
}

function publicRecord(record: LoadedRecord): DatasetRecord {
  const { imagePath: _imagePath, ...value } = record
  return value
}

export async function getDataset(filters: DatasetFilters = {}, page = 1, pageSize = 20) {
  const { root, records: rawRecords } = await allRecords()
  const records = await applyStoredAnnotations(rawRecords)
  const filtered = records.filter(record => matches(record, filters))
  const total = filtered.length
  const start = Math.max(0, (page - 1) * pageSize)
  const items = filtered.slice(start, start + Math.min(pageSize, 100)).map(publicRecord)
  const dates = [...new Set(records.map(record => record.date))]
  const stats = {
    total: records.length,
    exportable: records.filter(record => record.labelReady).length,
    pass: records.filter(record => record.status === 'PASS').length,
    review: records.filter(record => record.status === 'REVIEW').length,
    reject: records.filter(record => record.status === 'REJECT').length,
    missingImages: records.filter(record => !record.sourceExists).length
  }
  return { root, items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), dates, stats }
}

function datasetRecordPath(root: string, id: string) {
  const [date, ...filenameParts] = String(id || '').split('/')
  const filename = filenameParts.join('/')
  if (!date || !DATE_PATTERN.test(date) || !filename || basename(filename) !== filename || extname(filename).toLowerCase() !== '.json') {
    return null
  }
  const jsonPath = resolve(root, date, 'json', filename)
  return isWithinRoot(jsonPath, root) ? { date, filename, jsonPath } : null
}

async function recordMediaPaths(root: string, date: string, filename: string, payload: JsonObject) {
  const plate = asObject(payload.plate)
  const countryValue = String(payload.country || plate.country || 'thai').toLowerCase()
  const country = countryValue === 'lao' || countryValue === 'laos' ? 'laos' : 'thai'
  const rejected = filename.endsWith('_rejected_plate.json')
  const derived = (suffix: string) => rejected
    ? filename.replace(/_rejected_plate\.json$/, `-rejected-${suffix}.jpg`)
    : filename.replace(/_plate\.json$/, `-${suffix}.jpg`)
  const paths = new Set<string>()
  const add = async (rawPath: unknown, fallback: string) => {
    const candidates = datasetMediaCandidates(rawPath || fallback, root, date, country)
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        paths.add(resolve(candidate))
        return
      }
    }
  }
  await add(payload.full_vehicle_image || plate.full_vehicle_image, derived('full_vehicle'))
  await add(payload.crop_image || plate.crop_image, derived('plate_crops'))
  await add(payload.ocr_ready_image || plate.ocr_ready_image || plate.ocr_ready_archive_image, derived('ocr_ready'))
  return paths
}

async function unlinkIfPresent(path: string) {
  try {
    await unlink(path)
    return true
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false
    throw error
  }
}

export async function deleteDatasetRecords(ids: string[]) {
  const root = dataRoot()
  const requested = [...new Set(ids.map(String).filter(Boolean))]
  const protectedMedia = new Set<string>()
  const { records } = await allRecords()
  const requestedSet = new Set(requested)

  // Do not remove an image still referenced by another dataset record.
  for (const record of records) {
    if (requestedSet.has(record.id)) continue
    const descriptor = datasetRecordPath(root, record.id)
    if (!descriptor) continue
    try {
      const payload = JSON.parse(await readFile(descriptor.jsonPath, 'utf8')) as JsonObject
      for (const path of await recordMediaPaths(root, descriptor.date, descriptor.filename, payload)) protectedMedia.add(path)
    } catch {
      // A malformed unrelated record should not prevent deleting valid records.
    }
  }

  let deletedRecords = 0
  let deletedFiles = 0
  const missing: string[] = []
  for (const id of requested) {
    const descriptor = datasetRecordPath(root, id)
    if (!descriptor) {
      missing.push(id)
      continue
    }
    if (!(await exists(descriptor.jsonPath))) {
      missing.push(id)
      continue
    }

    let mediaPaths = new Set<string>()
    try {
      const payload = JSON.parse(await readFile(descriptor.jsonPath, 'utf8')) as JsonObject
      mediaPaths = await recordMediaPaths(root, descriptor.date, descriptor.filename, payload)
    } catch {
      // The JSON is still safe to remove; derived image names cover normal archives.
      mediaPaths = await recordMediaPaths(root, descriptor.date, descriptor.filename, {})
    }

    if (await unlinkIfPresent(descriptor.jsonPath)) deletedFiles += 1
    for (const mediaPath of mediaPaths) {
      if (protectedMedia.has(mediaPath)) continue
      if (await unlinkIfPresent(mediaPath)) deletedFiles += 1
    }
    deletedRecords += 1
  }

  try {
    await prisma.datasetAnnotation.deleteMany({ where: { datasetId: { in: requested } } })
  } catch {
    // The edit table may not exist yet on an older deployment; file deletion still stands.
  }
  return { deletedRecords, deletedFiles, missing }
}

function editCountry(value: unknown) {
  const country = String(value || '').trim().toLowerCase()
  if (country === 'thai' || country === 'lao' || country === 'laos') return country === 'lao' ? 'laos' : country
  throw new Error('Country must be thai or laos')
}

function editStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase()
  if (status === 'PASS' || status === 'REVIEW' || status === 'REJECT') return status as DatasetStatus
  throw new Error('Status must be PASS, REVIEW, or REJECT')
}

function editBox(value: unknown, width: number | null, height: number | null) {
  if (value === null) return null
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Bounding box must contain left, top, right, and bottom')
  const numbers = value.map(Number)
  if (numbers.some(number => !Number.isFinite(number))) throw new Error('Bounding box values must be numbers')
  const [left = 0, top = 0, right = 0, bottom = 0] = numbers
  if (right <= left || bottom <= top) throw new Error('Bounding box must have positive width and height')
  if (left < 0 || top < 0 || (width !== null && right > width) || (height !== null && bottom > height)) {
    throw new Error('Bounding box must stay inside the source image')
  }
  return numbers
}

export async function updateDatasetRecord(id: string, input: DatasetEditInput, updatedBy?: number) {
  const root = dataRoot()
  const descriptor = datasetRecordPath(root, id)
  if (!descriptor || !(await exists(descriptor.jsonPath))) throw new Error('Dataset record not found')

  const payload = JSON.parse(await readFile(descriptor.jsonPath, 'utf8')) as JsonObject
  const current = await readRecord(root, descriptor.date, descriptor.filename)
  const plate = asObject(payload.plate)
  const dataset = asObject(payload.dataset)
  const qc = asObject(payload.qc)
  const country = editCountry(input.country ?? payload.country ?? plate.country ?? 'thai')
  const province = String(input.province ?? payload.province ?? plate.province ?? '').trim()
  const platePrefix = String(input.platePrefix ?? payload.plate_prefix ?? plate.plate_prefix ?? '').trim()
  const plateNumber = String(input.plateNumber ?? payload.plate_number ?? plate.plate_number ?? '').trim()
  const status = editStatus(input.status ?? dataset.export_status ?? payload.training_status ?? qc.status ?? 'REVIEW')
  const box = input.box === undefined
    ? (Array.isArray(payload.box) ? payload.box : Array.isArray(plate.bbox) ? plate.bbox : null)
    : input.box
  const validatedBox = editBox(box, current?.imageWidth || null, current?.imageHeight || null)

  payload.country = country
  payload.province = province
  payload.plate_prefix = platePrefix
  payload.plate_number = plateNumber
  payload.box = validatedBox
  payload.training_status = status
  plate.country = country
  plate.province = province
  plate.plate_prefix = platePrefix
  plate.plate_number = plateNumber
  plate.bbox = validatedBox
  dataset.country = country
  dataset.qc = status
  dataset.export_status = status
  qc.status = status
  qc.need_review = status !== 'PASS'
  payload.plate = plate
  payload.dataset = dataset
  payload.qc = qc

  const tempPath = `${descriptor.jsonPath}.${process.pid}.tmp`
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await rename(tempPath, descriptor.jsonPath)

  try {
    await prisma.datasetAnnotation.upsert({
      where: { datasetId: id },
      create: {
        datasetId: id,
        date: descriptor.date,
        filename: descriptor.filename,
        country,
        province,
        platePrefix,
        plateNumber,
        status,
        box: validatedBox === null ? Prisma.JsonNull : validatedBox,
        updatedBy
      },
      update: {
        country,
        province,
        platePrefix,
        plateNumber,
        status,
        box: validatedBox === null ? Prisma.JsonNull : validatedBox,
        updatedBy
      }
    })
  } catch (error) {
    throw new Error(`Dataset JSON saved but database sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  return { id, country, province, platePrefix, plateNumber, status, box: validatedBox }
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(entries: ZipEntry[]) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll('\\', '/'))
    const compressed = deflateRawSync(entry.content, { level: 6 })
    const crc = crc32(entry.content)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt16LE(0, 10)
    header.writeUInt16LE(0, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(entry.content.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)
    local.push(header, name, compressed)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(0, 12)
    directory.writeUInt16LE(0, 14)
    directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(entry.content.length, 24)
    directory.writeUInt16LE(name.length, 28)
    directory.writeUInt16LE(0, 30)
    directory.writeUInt16LE(0, 32)
    directory.writeUInt16LE(0, 34)
    directory.writeUInt16LE(0, 36)
    directory.writeUInt32LE(0, 38)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, name)
    offset += header.length + name.length + compressed.length
  }
  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...local, centralBuffer, end])
}

function safeStem(record: LoadedRecord, index: number) {
  const text = record.plateText.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'plate'
  return `${record.date}-${String(index + 1).padStart(5, '0')}-${text}`
}

function yoloLabel(record: LoadedRecord) {
  if (!record.box || !record.imageWidth || !record.imageHeight) return null
  const [left = 0, top = 0, right = 0, bottom = 0] = record.box
  const width = record.imageWidth
  const height = record.imageHeight
  const x1 = Math.max(0, Math.min(width, left))
  const y1 = Math.max(0, Math.min(height, top))
  const x2 = Math.max(0, Math.min(width, right))
  const y2 = Math.max(0, Math.min(height, bottom))
  if (x2 <= x1 || y2 <= y1) return null
  return `0 ${((x1 + x2) / 2 / width).toFixed(8)} ${((y1 + y2) / 2 / height).toFixed(8)} ${((x2 - x1) / width).toFixed(8)} ${((y2 - y1) / height).toFixed(8)}\n`
}

export async function exportDataset(filters: DatasetFilters, ids: string[] = []) {
  const { root, records: rawRecords } = await allRecords()
  const records = await applyStoredAnnotations(rawRecords)
  const selected = ids.length ? records.filter(record => ids.includes(record.id)) : records.filter(record => matches(record, filters))
  const entries: ZipEntry[] = []
  const exported: DatasetRecord[] = []
  const skipped: Array<{ id: string, reason: string }> = []
  const trainRows: string[] = []
  for (const [index, record] of selected.entries()) {
    const label = yoloLabel(record)
    if (!record.sourceExists || !label) {
      skipped.push({ id: record.id, reason: !record.sourceExists ? 'missing image' : 'invalid bounding box' })
      continue
    }
    const imageName = `${safeStem(record, index)}${extname(record.imagePath).toLowerCase() || '.jpg'}`
    const stem = imageName.slice(0, imageName.lastIndexOf('.'))
    entries.push({ name: `train/images/${imageName}`, content: await readFile(record.imagePath) })
    entries.push({ name: `train/labels/${stem}.txt`, content: Buffer.from(label, 'utf8') })
    trainRows.push(`train/images/${imageName}`)
    exported.push(publicRecord(record))
  }
  const manifest = {
    format: 'Ultralytics YOLO Detection 1.0',
    class_names: ['license_plate'],
    source: 'OneVision scan/data',
    source_root: root,
    created_at: new Date().toISOString(),
    selected_count: selected.length,
    exported_count: exported.length,
    skipped_count: skipped.length,
    skipped,
    samples: exported.map(item => item.id)
  }
  entries.unshift(
    { name: 'data.yaml', content: Buffer.from('train: train.txt\nnames:\n  0: license_plate\n', 'utf8') },
    { name: 'train.txt', content: Buffer.from(`${trainRows.join('\n')}${trainRows.length ? '\n' : ''}`, 'utf8') },
    { name: 'export_manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
    { name: 'README.txt', content: Buffer.from('Ultralytics YOLO Detection 1.0 export from OneVision. Class 0 is license_plate. Review pre-labels before training.\n', 'utf8') }
  )
  const archiveName = `onevision-yolo-detection-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  const exportDir = join(root, 'exports')
  await mkdir(exportDir, { recursive: true })
  const archivePath = join(exportDir, archiveName)
  const archive = zip(entries)
  await writeFile(archivePath, archive)
  return { archive, archiveName, archivePath, selectedCount: selected.length, exportedCount: exported.length, skippedCount: skipped.length }
}

export async function getDatasetImage(id: string, variant: string = 'full') {
  const [date, ...filenameParts] = id.split('/')
  const filename = filenameParts.join('/')
  if (!date || !DATE_PATTERN.test(date) || !filename || basename(filename) !== filename) return null
  const root = dataRoot()
  const jsonPath = join(root, date, 'json', filename)
  let imagePath = ''
  try {
    const payload = JSON.parse(await readFile(jsonPath, 'utf8')) as JsonObject
    const plate = asObject(payload.plate)
    const countryValue = String(payload.country || plate.country || 'thai').toLowerCase()
    const country = countryValue === 'lao' || countryValue === 'laos' ? 'laos' : 'thai'
    const derivedImage = filename.endsWith('_rejected_plate.json')
      ? filename.replace(/_rejected_plate\.json$/, '-rejected-full_vehicle.jpg')
      : filename.replace(/_plate\.json$/, '-full_vehicle.jpg')
    imagePath = await resolveImagePath(payload.full_vehicle_image || plate.full_vehicle_image || derivedImage, root, date, country)
  } catch {
    return null
  }
  if (!(await exists(imagePath))) return null
  if (variant === 'crop') {
    imagePath = imagePath.replace(/-rejected-full_vehicle\./, '-rejected-plate_crops.').replace(/-full_vehicle\./, '-plate_crops.')
  }
  if (variant === 'ocr') {
    imagePath = imagePath.replace(/-rejected-full_vehicle\./, '-rejected-ocr_ready.').replace(/-full_vehicle\./, '-ocr_ready.')
  }
  if (!(await exists(imagePath))) return null
  return { content: await readFile(imagePath), extension: extname(imagePath).toLowerCase() }
}

export function datasetFilterFromQuery(query: Record<string, unknown>): DatasetFilters {
  return {
    date: query.date as string,
    country: query.country as string,
    status: query.status as string,
    search: query.search as string
  }
}
