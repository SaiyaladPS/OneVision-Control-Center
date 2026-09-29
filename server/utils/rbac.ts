import type { H3Event } from 'h3'

export type Role = 'ADMIN' | 'EDITOR' | 'USER' | 'SUPERUSER'

/**
 * checkRole: Middleware to verify user role in API handlers
 */
export const checkRole = async (event: H3Event, allowedRoles: Role[]) => {
    const { user } = await getUserSession(event)

    if (!user) {
        return sendApiError('Unauthorized', 401)
    }

    // Cast user.role to Role type
    const userRole = (user as any).role as Role

    if (userRole !== 'SUPERUSER' && !allowedRoles.includes(userRole)) {
        return sendApiError('Forbidden: You do not have permission', 403)
    }

    return true
}

/**
 * requireAdmin: Shortcut for Admin-only endpoints
 */
export const requireAdmin = (event: H3Event) => checkRole(event, ['ADMIN', 'SUPERUSER'])
