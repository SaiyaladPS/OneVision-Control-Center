import { customerService } from '../../services/customer.service'

export default defineEventHandler(async (event) => {
    const { user } = await getUserSession(event)
    if (!user || !['ADMIN', 'EDITOR', 'SUPERUSER'].includes((user as any).role)) {
        return sendApiError('Unauthorized', 403)
    }

    const id = Number(getRouterParam(event, 'id'))
    const data = await validateRequest(event, CustomerUpdateSchema)

    const customer = await customerService.updateCustomer(id, data)
    return sendSuccess(customer, 'Customer updated successfully')
})
