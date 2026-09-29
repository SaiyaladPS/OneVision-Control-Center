export default defineNuxtRouteMiddleware((to) => {
    const { loggedIn, user } = useUserSession()

    // If not logged in and trying to access any page other than /login
    if (!loggedIn.value && to.path !== '/login') {
        process.server && console.log(`[Auth] Redirecting to /login - User not logged in`)
        return navigateTo('/login')
    }

    // If already logged in and trying to access the login page, redirect to home/dashboard
    if (loggedIn.value && to.path === '/login') {
        process.server && console.log(`[Auth] Redirecting to / - User already logged in`)
        return navigateTo('/')
    }

    // Role-based protection
        if (loggedIn.value && to.meta.roles) {
        const allowedRoles = to.meta.roles as string[]
        const userRole = (user.value as any)?.role || ''
            if (userRole !== 'SUPERUSER' && !allowedRoles.includes(userRole)) {
            process.server && console.log(`[Auth] Forbidden - Role mismatch (${userRole} vs ${allowedRoles.join(',')})`)
            return navigateTo('/')
        }
    }
})
