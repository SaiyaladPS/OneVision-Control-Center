import CryptoJS from 'crypto-js'

const getSecretKey = (): string => {
    const runtimeKey = typeof useRuntimeConfig === 'function'
        ? useRuntimeConfig().public.passwordEncryptionKey as string
        : undefined
    const environmentKey = typeof process !== 'undefined'
        ? process.env.NUXT_PUBLIC_PASSWORD_ENCRYPTION_KEY || process.env.SECRET_KEY
        : undefined
    const key = runtimeKey || environmentKey

    if (!key) {
        throw new Error('Password encryption key is not configured')
    }
    return key
}

export const encryptPassword = (password: string): string => {
    return CryptoJS.AES.encrypt(password, getSecretKey()).toString()
}

export const decryptPassword = (encrypted: string): string => {
    const bytes = CryptoJS.AES.decrypt(encrypted, getSecretKey())
    return bytes.toString(CryptoJS.enc.Utf8)
}
