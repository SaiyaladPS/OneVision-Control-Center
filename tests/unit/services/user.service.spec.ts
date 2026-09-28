import { describe, it, expect, vi, beforeEach } from 'vitest'
import { userService } from '../../../server/services/user.service'
import { userRepository } from '../../../server/utils/repositories'
import * as cryptoUtils from '../../../server/utils/crypto'

// Mock the repository and crypto utilities
vi.mock('../../../server/utils/repositories', () => ({
    userRepository: {
        findPaginated: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findByUsername: vi.fn(),
        findByEmail: vi.fn()
    }
}))

vi.mock('../../../server/utils/crypto', () => ({
    hashUserPassword: vi.fn().mockImplementation((p) => Promise.resolve(`hashed_${p}`)),
    comparePassword: vi.fn().mockImplementation((p, h) => Promise.resolve(h === `hashed_${p}`))
}))

describe('UserService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('createUser', () => {
        it('should hash password and create user', async () => {
            const userData = { username: 'testuser', password: 'password123' }

            await userService.createUser(userData)

            expect(cryptoUtils.hashUserPassword).toHaveBeenCalledWith('password123')
            expect(userRepository.create).toHaveBeenCalledWith({
                username: 'testuser',
                password: 'hashed_password123'
            })
        })
    })

    describe('authenticate', () => {
        it('should return user if credentials are correct (hashed password)', async () => {
            const mockUser = { username: 'testuser', password: '$2hashed_password123' }
            vi.mocked(userRepository.findByUsername).mockResolvedValue(mockUser as any)
            vi.mocked(cryptoUtils.comparePassword).mockResolvedValue(true)

            const result = await userService.authenticate('testuser', 'password123')

            expect(result).toEqual(mockUser)
            expect(cryptoUtils.comparePassword).toHaveBeenCalledWith('password123', '$2hashed_password123')
        })

        it('should return user if credentials are correct (plain password fallback)', async () => {
            const mockUser = { username: 'testuser', password: 'plainPassword123' }
            vi.mocked(userRepository.findByUsername).mockResolvedValue(mockUser as any)

            const result = await userService.authenticate('testuser', 'plainPassword123')

            expect(result).toEqual(mockUser)
            expect(cryptoUtils.comparePassword).not.toHaveBeenCalled()
        })

        it('should return null if user not found', async () => {
            vi.mocked(userRepository.findByUsername).mockResolvedValue(null)

            const result = await userService.authenticate('unknown', 'any')

            expect(result).toBeNull()
        })
    })
})
