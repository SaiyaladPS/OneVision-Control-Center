import pkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import 'dotenv/config'

const { PrismaClient } = pkg
const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding OneVision access user...')

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { name: 'OneVision Admin', role: 'ADMIN', active: true },
    create: {
      username: 'admin',
      name: 'OneVision Admin',
      password: 'password123',
      role: 'ADMIN',
      active: true
    }
  })

  console.log('Seed completed. Existing Car Scan records were preserved.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    await pool.end()
    process.exit(1)
  })
