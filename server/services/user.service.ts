import { userRepository } from '../utils/repositories'
import { hashUserPassword, comparePassword } from '../utils/crypto'

export class UserService {
    async getUsers(params: { page: number; pageSize: number; search?: string; role?: string }) {
        const { page, pageSize, search, role } = params

        const where: any = {}
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { username: { contains: search } }
            ]
        }
        if (role && role !== 'all') {
            where.role = role.toLowerCase()
        }

        return await userRepository.findPaginated({
            page,
            pageSize,
            where,
            orderBy: { id: 'desc' }
        })
    }

    async createUser(data: any) {
        // Check duplicates logic could be here or in controller
        // Encryption/Hashing is a service responsibility
        const userData = {
            username: data.username,
            name: data.name,
            role: data.role || 'USER',
            password: data.password ? await hashUserPassword(data.password) : '',
            active: true
        }
        return await userRepository.create(userData)
    }

    async updateUser(id: number, data: any) {
        const userData = {
            ...(data.username ? { username: data.username } : {}),
            ...(data.name ? { name: data.name } : {}),
            ...(data.role ? { role: data.role } : {}),
            ...(data.password ? { password: await hashUserPassword(data.password) } : {})
        }
        return await userRepository.update(id, userData)
    }

    async deleteUser(id: number) {
        return await userRepository.delete(id)
    }

    async authenticate(username: string, passwordFromClient: string) {
        const user = await userRepository.findByUsername(username)
        if (!user) return null

        let isMatch = false
        if (user.password.startsWith('$2') || user.password.startsWith('pbkdf2$')) {
            isMatch = await comparePassword(passwordFromClient, user.password)
        } else {
            isMatch = user.password === passwordFromClient
        }

        return isMatch ? user : null
    }
}

export const userService = new UserService()
