import prisma from '../utils/prisma'

export type UserRoleCatalog = {
  code: string
  name: string
  permissions: string[]
  active: boolean
}

export type UserStatusCatalog = {
  code: string
  name: string
  active: boolean
}

const ROLE_SEEDS: Array<[string, string, string]> = [
  ['ADMIN', 'Administrator', '["scan.image","scan.video","scan.camera","results.save","users.manage"]'],
  ['EDITOR', 'Editor', '["scan.image","scan.video","scan.camera","results.save"]'],
  ['USER', 'User', '[]'],
  ['SUPERUSER', 'Super User', '["*"]']
]

const STATUS_SEEDS: Array<[string, string]> = [
  ['ACTIVE', 'Active'],
  ['INACTIVE', 'Inactive'],
  ['SUSPENDED', 'Suspended']
]

let catalogReady: Promise<void> | null = null

export async function ensureUserCatalog(): Promise<void> {
  if (!catalogReady) {
    catalogReady = (async () => {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE'
      `)
      await prisma.$executeRawUnsafe(`
        UPDATE "users" SET "status" = CASE WHEN "active" THEN 'ACTIVE' ELSE 'INACTIVE' END
        WHERE "status" IS NULL OR "status" = ''
      `)
      await prisma.$executeRawUnsafe(`
        UPDATE "users" SET "role" = CASE LOWER("role")
          WHEN 'admin' THEN 'ADMIN'
          WHEN 'operator' THEN 'EDITOR'
          WHEN 'viewer' THEN 'USER'
          WHEN 'superuser' THEN 'SUPERUSER'
          ELSE UPPER("role")
        END
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "user_roles" (
          "code" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "permissions" JSONB,
          "active" BOOLEAN NOT NULL DEFAULT TRUE,
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "user_statuses" (
          "code" TEXT PRIMARY KEY,
          "name" TEXT NOT NULL,
          "active" BOOLEAN NOT NULL DEFAULT TRUE,
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      for (const [code, name, permissions] of ROLE_SEEDS) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "user_roles" ("code", "name", "permissions", "active", "updated_at")
           VALUES ($1, $2, $3::jsonb, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "permissions" = EXCLUDED."permissions", "active" = TRUE, "updated_at" = CURRENT_TIMESTAMP`,
          code,
          name,
          permissions
        )
      }
      for (const [code, name] of STATUS_SEEDS) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "user_statuses" ("code", "name", "active", "updated_at")
           VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
           ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "active" = TRUE, "updated_at" = CURRENT_TIMESTAMP`,
          code,
          name
        )
      }
    })().catch((error) => {
      catalogReady = null
      throw error
    })
  }
  await catalogReady
}

export async function listUserRoles(): Promise<UserRoleCatalog[]> {
  await ensureUserCatalog()
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string; name: string; permissions: unknown; active: boolean }>>(
    `SELECT "code", "name", "permissions", "active" FROM "user_roles" WHERE "active" = TRUE ORDER BY "code"`
  )
  return rows.map(row => ({
    code: String(row.code),
    name: String(row.name),
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    active: Boolean(row.active)
  })).filter(role => ['ADMIN', 'EDITOR', 'USER', 'SUPERUSER'].includes(role.code))
}

export async function listUserStatuses(): Promise<UserStatusCatalog[]> {
  await ensureUserCatalog()
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string; name: string; active: boolean }>>(
    `SELECT "code", "name", "active" FROM "user_statuses" WHERE "active" = TRUE ORDER BY "code"`
  )
  return rows.map(row => ({ code: String(row.code), name: String(row.name), active: Boolean(row.active) }))
}

export async function isUserRole(code: string): Promise<boolean> {
  const roles = await listUserRoles()
  return roles.some(role => role.code === String(code).toUpperCase())
}

export async function isUserStatus(code: string): Promise<boolean> {
  const statuses = await listUserStatuses()
  return statuses.some(status => status.code === String(code).toUpperCase())
}
