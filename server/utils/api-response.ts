import { apiLogger } from './logger'

export interface ApiResponse<T = any> {
    success: boolean
    message?: string
    data?: T
    meta?: {
        total?: number
        page?: number
        pageSize?: number
        totalPages?: number
        [key: string]: any
    }
    errors?: any
}

export const sendSuccess = <T>(data: T, message?: string, meta?: any): ApiResponse<T> => {
    return {
        success: true,
        message,
        data,
        meta
    }
}

const statusMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    418: "I'm a teapot",
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
}

export const createApiError = (message: string, statusCode: number = 400, data?: unknown) => {
    return createError({
        statusCode,
        statusMessage: statusMessages[statusCode] || 'Request failed',
        message,
        data
    })
}

export const sendApiError = (message: string, statusCode: number = 400, errors?: any) => {
    // Log the error for server-side visibility
    apiLogger.error(`[${statusCode}] ${message}`, errors || '')

    throw createApiError(message, statusCode, {
        success: false,
        message,
        errors
    })
}
