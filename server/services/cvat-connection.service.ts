import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import prisma from '../utils/prisma'

export interface CvatConnectionInput {
  name?: unknown
  baseUrl?: unknown
  organization?: unknown
  projectId?: unknown
  taskId?: unknown
  accessToken?: unknown
  isDefault?: unknown
}

function cleanText(value: unknown, label: string, required = false) {
  const text = String(value ?? '').trim()
  if (required && !text) throw new Error(`${label} is required`)
  return text || null
}

function encryptAccessToken(token: string) {
  const secret = useRuntimeConfig().secretKey || process.env.SECRET_KEY
  if (!secret) throw new Error('SECRET_KEY must be configured before saving CVAT credentials')
  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`
}

function connectionInput(input: CvatConnectionInput) {
  const name = cleanText(input.name, 'Connection name', true) as string
  if (name.length > 120) throw new Error('Connection name must be 120 characters or fewer')
  const baseUrl = cleanText(input.baseUrl, 'CVAT URL', true) as string
  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    throw new Error('CVAT URL must be a valid HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('CVAT URL must use HTTP or HTTPS')

  return {
    name,
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    organization: cleanText(input.organization, 'Organization'),
    projectId: cleanText(input.projectId, 'Project ID'),
    taskId: cleanText(input.taskId, 'Task ID'),
    isDefault: Boolean(input.isDefault)
  }
}

function publicConnection(connection: Awaited<ReturnType<typeof prisma.cvatConnection.findMany>>[number]) {
  const { accessTokenEncrypted: _secret, ...safe } = connection
  return { ...safe, hasAccessToken: Boolean(_secret) }
}

export async function listCvatConnections() {
  const connections = await prisma.cvatConnection.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })
  return connections.map(publicConnection)
}

export async function createCvatConnection(input: CvatConnectionInput) {
  const data = connectionInput(input)
  const accessToken = cleanText(input.accessToken, 'Access token', true) as string
  const accessTokenEncrypted = encryptAccessToken(accessToken)
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.cvatConnection.updateMany({ data: { isDefault: false } })
    const connection = await tx.cvatConnection.create({ data: { ...data, accessTokenEncrypted } })
    return publicConnection(connection)
  })
}

export async function updateCvatConnection(id: number, input: CvatConnectionInput) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid CVAT connection ID')
  const data = connectionInput(input)
  const token = cleanText(input.accessToken, 'Access token')
  const accessTokenEncrypted = token ? encryptAccessToken(token) : undefined
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cvatConnection.findUnique({ where: { id } })
    if (!existing) throw new Error('CVAT connection not found')
    if (data.isDefault) await tx.cvatConnection.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
    const connection = await tx.cvatConnection.update({
      where: { id },
      data: { ...data, ...(accessTokenEncrypted ? { accessTokenEncrypted } : {}) }
    })
    return publicConnection(connection)
  })
}

export async function deleteCvatConnection(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid CVAT connection ID')
  await prisma.cvatConnection.delete({ where: { id } })
  return { id }
}
