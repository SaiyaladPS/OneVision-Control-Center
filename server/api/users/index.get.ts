import { userService } from '../../services/user.service'

export default defineEventHandler(async (event) => {
    await requireAdmin(event)
    const query = getQuery(event)

    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 10
    const search = query.search as string
    const role = query.role as string
    const status = query.status as string

    const result = await userService.getUsers({
        page,
        pageSize,
        search,
        role,
        status
    })

    return sendSuccess(result)
})
