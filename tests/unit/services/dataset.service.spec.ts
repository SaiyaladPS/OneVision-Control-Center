import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDatasetRecords } from '../../../server/services/dataset.service'

describe('dataset deletion', () => {
  let root = ''
  const originalRoot = process.env.ONEVISION_DATA_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'onevision-dataset-'))
    process.env.ONEVISION_DATA_ROOT = root
  })

  afterEach(async () => {
    if (originalRoot === undefined) delete process.env.ONEVISION_DATA_ROOT
    else process.env.ONEVISION_DATA_ROOT = originalRoot
    await rm(root, { recursive: true, force: true })
  })

  it('deletes the JSON record and its full, crop, and OCR images', async () => {
    const date = '20260925'
    const filename = '575_plate.json'
    const imageDir = join(root, date, 'thai')
    const jsonDir = join(root, date, 'json')
    await mkdir(imageDir, { recursive: true })
    await mkdir(jsonDir, { recursive: true })
    await writeFile(join(jsonDir, filename), JSON.stringify({
      country: 'thai',
      plate_number: '575',
      full_vehicle_image: 'D:\\old-onevision\\575-full_vehicle.jpg',
      crop_image: 'D:\\old-onevision\\575-plate_crops.jpg',
      ocr_ready_image: 'D:\\old-onevision\\575-ocr_ready.jpg'
    }))
    for (const image of ['575-full_vehicle.jpg', '575-plate_crops.jpg', '575-ocr_ready.jpg']) {
      await writeFile(join(imageDir, image), 'image')
    }

    const result = await deleteDatasetRecords([`${date}/${filename}`])

    expect(result).toEqual({ deletedRecords: 1, deletedFiles: 4, missing: [] })
    await expect(readFile(join(jsonDir, filename))).rejects.toThrow()
    for (const image of ['575-full_vehicle.jpg', '575-plate_crops.jpg', '575-ocr_ready.jpg']) {
      await expect(readFile(join(imageDir, image))).rejects.toThrow()
    }
  })

  it('rejects IDs that could escape the dataset root', async () => {
    const result = await deleteDatasetRecords(['20260925/../outside.json'])

    expect(result).toEqual({ deletedRecords: 0, deletedFiles: 0, missing: ['20260925/../outside.json'] })
  })
})
