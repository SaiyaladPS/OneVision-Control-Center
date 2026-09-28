import CryptoJS from 'crypto-js'
import bcrypt from 'bcryptjs'
import { createError } from 'h3'
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)
const PBKDF2_ALGORITHM = 'sha256'
const PBKDF2_ITERATIONS = 180000
const PBKDF2_KEY_LENGTH = 32

const PBKDF2_HASH_PATTERN = /^pbkdf2\$sha256\$(\d+)\$([0-9a-fA-F]+)\$([0-9a-fA-F]+)$/

export const decryptPassword = (encrypted: string): string => {
    try {
        const runtimeKey = typeof useRuntimeConfig === 'function'
            ? useRuntimeConfig().secretKey as string
            : undefined
        const secretKey = runtimeKey || process.env.SECRET_KEY
        if (!secretKey) {
            throw new Error('Password encryption key is not configured')
        }

        const bytes = CryptoJS.AES.decrypt(encrypted, secretKey)
        const decrypted = bytes.toString(CryptoJS.enc.Utf8)
        if (!decrypted) throw new Error('Decryption failed')
        return decrypted
    } catch (e) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid encrypted password format'
        })
    }
}

export const hashUserPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(16).toString('hex')
    const derivedKey = await pbkdf2Async(
        password,
        Buffer.from(salt, 'hex'),
        PBKDF2_ITERATIONS,
        PBKDF2_KEY_LENGTH,
        PBKDF2_ALGORITHM
    )

    return `pbkdf2$${PBKDF2_ALGORITHM}$${PBKDF2_ITERATIONS}$${salt}$${(derivedKey as Buffer).toString('hex')}`
}

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    const pbkdf2Parts = hash.match(PBKDF2_HASH_PATTERN)
    if (pbkdf2Parts) {
        const iterationsText = pbkdf2Parts[1]
        const salt = pbkdf2Parts[2]
        const storedDigest = pbkdf2Parts[3]

        if (!iterationsText || !salt || !storedDigest) {
            return false
        }

        const iterations = Number(iterationsText)

        if (!Number.isSafeInteger(iterations) || iterations <= 0 || storedDigest.length !== PBKDF2_KEY_LENGTH * 2) {
            return false
        }

        const derivedKey = await pbkdf2Async(
            password,
            Buffer.from(salt, 'hex'),
            iterations,
            PBKDF2_KEY_LENGTH,
            PBKDF2_ALGORITHM
        ) as Buffer
        const storedKey = Buffer.from(storedDigest, 'hex')

        return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey)
    }

    return await bcrypt.compare(password, hash)
}
