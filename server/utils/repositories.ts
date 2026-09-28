import { BaseRepository } from './base-repository'
import prisma from './prisma'

export class UserRepository extends BaseRepository<any> {
    constructor() {
        super(prisma.user)
    }

    // Custom logic for User
    async findByEmail(email: string) {
        return this.model.findUnique({
            where: { email }
        })
    }

    async findByUsername(username: string) {
        return this.model.findUnique({
            where: { username }
        })
    }

    async updatePassword(id: number, newPasswordHash: string) {
        return this.model.update({
            where: { id },
            data: { password: newPasswordHash }
        })
    }
}

export class CustomerRepository extends BaseRepository<any> {
    constructor() {
        // Legacy customer routes now point to the shared Car Scan dataset.
        super(prisma.plate)
    }

    async findByEmail(email: string) {
        return this.model.findUnique({
            where: { email }
        })
    }
}

// Export singleton instances
export const userRepository = new UserRepository()
export const customerRepository = new CustomerRepository()
