import { userService } from '../../services/user.service'
import { decryptPassword } from '../../utils/crypto'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { username, password: encryptedPassword } = body

    if (!username || !encryptedPassword) {
        return sendApiError('Username and password are required', 400)
    }

    // 1. Decrypt password received from frontend
    const password = decryptPassword(encryptedPassword)

    // 2. Authenticate via Service
    const user = await userService.authenticate(username, password)

    if (!user) {
        return sendApiError('ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ', 401)
    }

    // 3. Set Session
    await setUserSession(event, {
        user: {
            id: user.id,
            email: `${user.username}@onevision.local`,
            username: user.username || '',
            name: user.name,
            avatar: '',
            role: String(user.role || 'USER').toUpperCase()
        },
        loggedInAt: new Date()
    })

    return { success: true, message: 'ເຂົ້າສູ່ລະບົບສຳເລັດ' }
})
