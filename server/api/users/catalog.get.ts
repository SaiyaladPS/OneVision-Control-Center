import { requireAdmin } from '../../utils/rbac'
import { listUserRoles, listUserStatuses } from '../../services/user-catalog.service'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const [roles, statuses] = await Promise.all([listUserRoles(), listUserStatuses()])
  return sendSuccess({ roles, statuses })
})
