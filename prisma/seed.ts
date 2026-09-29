import pkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import 'dotenv/config'

const { PrismaClient } = pkg
const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const digest = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 180000, 32, 'sha256').toString('hex')
  return `pbkdf2$sha256$180000$${salt}$${digest}`
}

async function main() {
  console.log('Seeding OneVision roles, statuses, and sample users...')

  const roles = [
    ['ADMIN', 'Administrator', ['scan.image', 'scan.video', 'scan.camera', 'results.save', 'users.manage']],
    ['EDITOR', 'Editor', ['scan.image', 'scan.video', 'scan.camera', 'results.save']],
    ['USER', 'User', []],
    ['SUPERUSER', 'Super User', ['*']]
  ] as const
  for (const [code, name, permissions] of roles) {
    await prisma.userRole.upsert({
      where: { code },
      update: { name, permissions, active: true },
      create: { code, name, permissions, active: true }
    })
  }

  for (const [code, name] of [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive'], ['SUSPENDED', 'Suspended']] as const) {
    await prisma.userStatus.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name, active: true }
    })
  }

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { name: 'OneVision Admin', role: 'ADMIN', active: true, status: 'ACTIVE' },
    create: {
      username: 'admin',
      name: 'OneVision Admin',
      password: 'password123',
      role: 'ADMIN',
      active: true,
      status: 'ACTIVE'
    }
  })

  const sampleNames = [
    'ສົມພອນ ວົງສາ',
    'ນາງ ມະນີວັນ ສີສຸລາດ',
    'ອານຸສອນ ພົມມະຈັນ',
    'ກິດຕິພົງ ໄຊຍະວົງ',
    'ສຸລິຍາ ແກ້ວມະນີ',
    'ທອງດີ ພັນທະວົງ',
    'ວິໄລວັນ ບຸນມີ',
    'ສຸພາພອນ ຈັນທະລາ',
    'ພູວຽງ ອິນທະວົງ',
    'ຈັນທະລີ ສີຫາລາດ',
    'ສຸກສະຫວັນ ວິໄລສັກ',
    'ຄຳແພງ ພົມມະສອນ',
    'ວັນນະສອນ ເພັດສະຫວັນ',
    'ບຸນທັນ ສີວິໄລ',
    'ດາວເຮືອງ ມະນີວົງ',
    'ອຸດົມພອນ ໄຊຊະນະ',
    'ສົມໃຈ ທອງສີ',
    'ສຸວັນນີ ບຸນປະເສີດ',
    'ພອນໄຊ ສີສຸພັນ',
    'ມະນີລາ ວົງວິໄລ',
    'ທິບພະວັນ ຈັນທະວົງ',
    'ສົມບັດ ພູມມະວົງ',
    'ແກ້ວພອນ ວິລະວົງ',
    'ວິສິດ ສີຫານາດ',
    'ອອນລະວັນ ໄຊຍະສອນ',
    'ບຸນເລີດ ສຸວັນນະວົງ',
    'ສຸດາລັດ ພົມມະຈັນ',
    'ໄຊພອນ ທຳມະວົງ',
    'ມຸກດາ ສີວົງສາ',
    'ສີສະຫວາດ ບຸນທະວີ'
  ]

  for (let index = 1; index <= 30; index += 1) {
    const number = String(index).padStart(2, '0')
    const role = index === 1 ? 'ADMIN' : index === 2 ? 'SUPERUSER' : index % 3 === 0 ? 'EDITOR' : 'USER'
    const status = index >= 29 ? 'SUSPENDED' : index >= 26 ? 'INACTIVE' : 'ACTIVE'
    await prisma.user.upsert({
      where: { username: `sample.user${number}` },
      update: {
        name: sampleNames[index - 1],
        role,
        active: status === 'ACTIVE',
        status,
        password: hashPassword(`Demo@2026${number}`)
      },
      create: {
        username: `sample.user${number}`,
        name: sampleNames[index - 1],
        role,
        active: status === 'ACTIVE',
        status,
        password: hashPassword(`Demo@2026${number}`)
      }
    })
  }

  console.log('Seed completed: 30 sample users created/updated. Existing Car Scan records were preserved.')
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
