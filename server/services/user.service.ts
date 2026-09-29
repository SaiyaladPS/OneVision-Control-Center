import { userRepository } from '../utils/repositories'
import { hashUserPassword, comparePassword } from '../utils/crypto'
import { ensureUserCatalog, isUserRole, isUserStatus } from './user-catalog.service'

export class UserService {
    async getUsers(params: { page: number; pageSize: number; search?: string; role?: string; status?: string }) {
        await ensureUserCatalog()
        const { page, pageSize, search, role, status } = params

        const where: any = {}
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { username: { contains: search } }
            ]
        }
        if (role && role !== 'all') {
            where.role = role.toUpperCase()
        }
        if (status && status !== 'all') {
            where.status = status.toUpperCase()
        }

        return await userRepository.findPaginated({
            page,
            pageSize,
            where,
            orderBy: { id: 'desc' }
        })
    }

    async createUser(data: any) {
        await ensureUserCatalog()
        const role = String(data.role || 'USER').toUpperCase()
        if (!(await isUserRole(role))) throw new Error('Unknown user role')
        const status = String(data.status || 'ACTIVE').toUpperCase()
        if (!(await isUserStatus(status))) throw new Error('Unknown user status')
        // Check duplicates logic could be here or in controller
        // Encryption/Hashing is a service responsibility
        const userData = {
            username: data.username,
            name: data.name,
            role,
            password: data.password ? await hashUserPassword(data.password) : '',
            active: status === 'ACTIVE',
            status
        }
        return await userRepository.create(userData)
    }

    async updateUser(id: number, data: any) {
        await ensureUserCatalog()
        const role = data.role ? String(data.role).toUpperCase() : undefined
        if (role && !(await isUserRole(role))) throw new Error('Unknown user role')
        const status = data.status ? String(data.status).toUpperCase() : undefined
        if (status && !(await isUserStatus(status))) throw new Error('Unknown user status')
        const userData = {
            ...(data.username ? { username: data.username } : {}),
            ...(data.name ? { name: data.name } : {}),
            ...(role ? { role } : {}),
            ...(data.password ? { password: await hashUserPassword(data.password) } : {}),
            ...(status ? { status, active: status === 'ACTIVE' } : {})
        }
        return await userRepository.update(id, userData)
    }

    async deleteUser(id: number) {
        return await userRepository.delete(id)
    }

    async authenticate(username: string, passwordFromClient: string) {
        await ensureUserCatalog()
        const user = await userRepository.findByUsername(username)
        if (!user || user.active === false || (user.status && user.status !== 'ACTIVE')) return null

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
