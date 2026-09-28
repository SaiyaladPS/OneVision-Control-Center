import type { PrismaClient as PrismaClientType } from '@prisma/client'
import pkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { dbLogger } from './logger'

const { PrismaClient } = pkg

// Camera settings are shared with the Car Scan service through the cameras table.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientType | undefined
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || '',
    max: 10,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true
})
const adapter = new PrismaPg(pool)

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
        ],
    })

// Bind Prisma events to our custom logger
if (process.env.NODE_ENV === 'development') {
    (prisma as any).$on('query', (e: any) => {
        dbLogger.debug(`${e.query} (${e.duration}ms)`)
    })
}

(prisma as any).$on('error', (e: any) => {
    dbLogger.error(e.message)
});

(prisma as any).$on('warn', (e: any) => {
    dbLogger.warn(e.message)
})

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}

export default prisma
