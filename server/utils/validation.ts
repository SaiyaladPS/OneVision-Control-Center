import { z } from 'zod'
import type { H3Event } from 'h3'

/**
 * Helper to validate request body/query using Zod
 */
export async function validateRequest<T extends z.ZodTypeAny>(
    event: H3Event,
    schema: T,
    type: 'body' | 'query' = 'body'
): Promise<z.infer<T>> {
    try {
        const data = type === 'body' ? await readBody(event) : getQuery(event)
        return await schema.parseAsync(data)
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return sendApiError('Validation Error', 422, error.flatten().fieldErrors)
        }
        throw error
    }
}
// User Validation Schemas
export const UserSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    name: z.string().min(2),
    role: z.enum(['ADMIN', 'EDITOR', 'USER']).default('USER')
})

export const UserUpdateSchema = UserSchema.partial()

// Customer Validation Schemas
export const CustomerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    status: z.enum(['subscribed', 'unsubscribed', 'bounced']).default('subscribed'),
    location: z.string().optional().nullable(),
    avatar: z.string().url().optional().nullable()
})

export const CustomerUpdateSchema = CustomerSchema.partial()
