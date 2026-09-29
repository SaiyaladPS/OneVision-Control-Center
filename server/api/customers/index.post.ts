import { customerService } from '../../services/customer.service'
import { customerRepository } from '../../utils/repositories'

export default defineEventHandler(async (event) => {
    // Basic protection (can be ADMIN or EDITOR for customers)
    const { user } = await getUserSession(event)
    if (!user || !['ADMIN', 'EDITOR', 'SUPERUSER'].includes((user as any).role)) {
        return sendApiError('Unauthorized', 403)
    }

    const data = await validateRequest(event, CustomerSchema)

    // Check if email exists
    const existing = await customerRepository.findByEmail(data.email)
    if (existing) {
        return sendApiError('Customer email already exists', 409)
    }

    const customer = await customerService.createCustomer(data)
    return sendSuccess(customer, 'Customer created successfully')
})
