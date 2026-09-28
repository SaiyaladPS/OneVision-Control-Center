import { describe, it, expect } from 'vitest'
import { decryptPassword, hashUserPassword, comparePassword } from '../../../server/utils/crypto'
import { encryptPassword } from '../../../app/utils/crypto'

describe('Crypto Utilities', () => {
    const rawPassword = 'my-secret-password-123'

    it('should encrypt and decrypt correctly', () => {
        const encrypted = encryptPassword(rawPassword)
        expect(encrypted).not.toBe(rawPassword)

        const decrypted = decryptPassword(encrypted)
        expect(decrypted).toBe(rawPassword)
    })

    it('should hash and compare passwords correctly', async () => {
        const hash = await hashUserPassword(rawPassword)
        expect(hash).toMatch(/^pbkdf2\$sha256\$180000\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
        expect(hash).not.toBe(rawPassword)

        const isMatch = await comparePassword(rawPassword, hash)
        expect(isMatch).toBe(true)

        const isNotMatch = await comparePassword('wrong-password', hash)
        expect(isNotMatch).toBe(false)
    })

    it('should compare the database PBKDF2-SHA256 format', async () => {
        const hash = 'pbkdf2$sha256$180000$73ac7e25ef4865551be113ff07acbb24$76a91328f8ee5d64114f544f10038a3c282e70fd1fe0f6afa2dd750666a1302d'

        await expect(comparePassword('changeme', hash)).resolves.toBe(true)
        await expect(comparePassword('wrong-password', hash)).resolves.toBe(false)
    })

    it('should throw error on invalid decryption', () => {
        expect(() => decryptPassword('invalid-encrypted-string')).toThrow()
    })
})
