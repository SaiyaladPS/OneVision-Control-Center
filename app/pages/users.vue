<script setup lang="ts">
import type { RowSelectionState } from '@tanstack/table-core'

definePageMeta({
  layout: 'default',
  roles: ['ADMIN', 'EDITOR', 'USER'] // Allow view for others, but restrict actions
})

const { user } = useUserSession()
const isAdmin = computed(() => (user.value as any)?.role === 'ADMIN')

const UCheckbox = resolveComponent('UCheckbox')

const columns = computed(() => {
  const cols = [
    {
      accessorKey: 'id',
      header: 'ID'
    }, 
    {
      accessorKey: 'username',
      header: 'Username'
    }, 
    {
      accessorKey: 'name',
      header: 'Name'
    }, 
    {
      accessorKey: 'role',
      header: 'Role'
    }, 
    {
      id: 'actions',
      header: ''
    }
  ]

  if (isAdmin.value) {
    cols.unshift({
      id: 'select',
      header: ({ table }: any) =>
        h(UCheckbox as any, {
          'modelValue': table.getIsSomePageRowsSelected()
            ? 'indeterminate'
            : table.getIsAllPageRowsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') =>
            table.toggleAllPageRowsSelected(!!value),
          'ariaLabel': 'Select all'
        }),
      cell: ({ row }: any) =>
        h(UCheckbox as any, {
          'modelValue': row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
          'ariaLabel': 'Select row'
        })
    } as any)
  }

  return cols
})

// API & Global State
const page = ref(1)
const pageSize = ref(10)
const search = ref('')
const roleFilter = ref('all')
const columnVisibility = ref({})

// Reset page when pageSize or roleFilter changes
watch([pageSize, roleFilter], () => {
  page.value = 1
})
const isModalOpen = ref(false)
const editingUser = ref<any>(null)
const rowSelection = ref<RowSelectionState>({})

const { data: users, refresh, pending } = useApi<any>(() => {
  const params = new URLSearchParams({
    page: page.value.toString(),
    pageSize: pageSize.value.toString(),
    search: search.value
  })
  if (roleFilter.value && roleFilter.value !== 'all') params.append('role', roleFilter.value)
  
  return `/api/users?${params.toString()}`
})
const { execute: deleteUser, loading: deleting } = useApiAction()

// Table API
const table = useTemplateRef<any>('table')
const selectedRows = computed(() => table.value?.tableApi?.getFilteredSelectedRowModel().rows || [])

const isConfirmOpen = ref(false)
const confirmTarget = ref<{ id?: any, type: 'single' | 'bulk' } | null>(null)

// Modal Actions
function openCreate() {
  editingUser.value = null
  isModalOpen.value = true
}

function openEdit(user: any) {
  editingUser.value = user
  isModalOpen.value = true
}

function onModalSuccess() {
  isModalOpen.value = false
  refresh()
}

function getRowItems(user: any) {
  return [
    [{
      label: 'Edit',
      icon: 'i-lucide-pencil',
      onSelect: () => openEdit(user)
    }, {
      label: 'Delete',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => startDelete(user.id)
    }]
  ]
}

// Bulk Actions
function startDelete(id: any) {
  confirmTarget.value = { id, type: 'single' }
  isConfirmOpen.value = true
}

function startBulkDelete() {
  confirmTarget.value = { type: 'bulk' }
  isConfirmOpen.value = true
}

async function onConfirmDelete() {
  if (!confirmTarget.value) return

  if (confirmTarget.value.type === 'single') {
    const { error } = await deleteUser(
      () => $fetch(`/api/users/${confirmTarget.value?.id}`, { method: 'DELETE' }) as any,
      { successMessage: 'ລົບຂໍ້ມູນສຳເລັດ' }
    )
    if (!error) refresh()
  } else {
    const count = selectedRows.value.length
    for (const row of selectedRows.value) {
      await $fetch(`/api/users/${row.original.id}`, { method: 'DELETE' })
    }
    useToast().add({ title: 'ສຳເລັດ', description: `ລົບຂໍ້ມູນ ${count} ລາຍການແລ້ວ`, color: 'success' })
    rowSelection.value = {}
    refresh()
  }
  isConfirmOpen.value = false
}
</script>

<template>
  <UDashboardPanel id="users" grow>
    <template #header>
      <UDashboardNavbar title="User Management">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        
        <template #right>
          <UButton v-if="isAdmin" label="Add User" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <div class="flex items-center gap-1.5">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search by name or username..."
              class="w-64"
            />
            
            <USelect
              v-model="roleFilter"
              :items="[
                { label: 'All Roles', value: 'all' },
                { label: 'Admin', value: 'ADMIN' },
                { label: 'Editor', value: 'EDITOR' },
                { label: 'User', value: 'USER' }
              ]"
              class="w-32"
            />

            <USelect
              v-model="pageSize"
              :items="[5, 10, 20, 50, 100]"
              class="w-20"
            />

            <UDropdownMenu
              :items="
                table?.tableApi
                  ?.getAllColumns()
                  .filter((column: any) => column.getCanHide())
                  .map((column: any) => ({
                    label: column.id,
                    type: 'checkbox' as const,
                    checked: column.getIsVisible(),
                    onUpdateChecked(checked: boolean) {
                      table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                    },
                    onSelect(e?: Event) {
                      e?.preventDefault()
                    }
                  }))
              "
              :content="{ align: 'end' }"
            >
              <UButton
                label="Display"
                color="neutral"
                variant="outline"
                trailing-icon="i-lucide-settings-2"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #right>
          <UButton
            v-if="isAdmin && selectedRows.length > 0"
            label="Delete Selected"
            color="error"
            variant="subtle"
            icon="i-lucide-trash"
            @click="startBulkDelete"
          >
            <template #trailing>
              <UKbd>{{ selectedRows.length }}</UKbd>
            </template>
          </UButton>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Modals -->
      <UsersUserFormModal v-model:open="isModalOpen" :user="editingUser" @success="onModalSuccess" @close="isModalOpen = false" />
      <ConfirmModal
        v-model:open="isConfirmOpen"
        :title="confirmTarget?.type === 'bulk' ? 'ລົບຂໍ້ມູນທີ່ເລືອກ' : 'ລົບຂໍ້ມູນຜູ້ໃຊ້'"
        :description="confirmTarget?.type === 'bulk' ? `ທ່ານແນ່ໃຈຫຼືບໍ່ທີ່ຈະລົບຂໍ້ມູນທີ່ເລືອກທັງໝົດ ${selectedRows.length} ລາຍການ?` : 'ທ່ານແນ່ໃຈຫຼືບໍ່ທີ່ຈະລົບຂໍ້ມູນຜູ້ໃຊ້ນີ້?'"
        :loading="deleting"
        @confirm="onConfirmDelete"
        @close="isConfirmOpen = false"
      />

      <!-- Main Content -->
      <UDashboardPanelContent scrollable class="p-0">
        <UTable
          ref="table"
          v-model:row-selection="rowSelection"
          v-model:column-visibility="columnVisibility"
          :data="users?.data?.data || []"
          :columns="columns"
          :loading="pending"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default',
            separator: 'h-0'
          }"
        >
          <!-- Custom Cell Templates -->
          <template #name-cell="{ row }">
            <div class="flex items-center gap-3 text-sm">
              <UAvatar :src="(row.original.avatar as string | undefined)" :alt="(row.original.name as string)" size="sm" />
              <div class="flex flex-col">
                <span class="font-medium text-highlighted">{{ row.original.name }}</span>
              </div>
            </div>
          </template>

          <template #role-cell="{ row }">
            <UBadge :color="row.original.role === 'ADMIN' ? 'primary' : 'neutral'" variant="subtle" size="sm">
              {{ row.original.role }}
            </UBadge>
          </template>
          
          <template #actions-cell="{ row }">
            <div class="flex items-center justify-end">
              <UDropdownMenu v-if="isAdmin" :items="getRowItems(row.original)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" />
              </UDropdownMenu>
              <span v-else class="text-xs text-neutral-400">View only</span>
            </div>
          </template>
        </UTable>

        <!-- Pagination Footer (Inside scrollable content to be at the bottom of data) 
             Alternatively, put it outside but ensure Panel lets it stay bottom. -->
        <div class="flex items-center justify-between gap-3 border-t border-default p-4 bg-white dark:bg-neutral-900 text-sm sticky bottom-0 z-10">
          <div class="text-neutral-500">
            {{ selectedRows.length }} of {{ users?.data?.meta?.total || 0 }} row(s) selected.
          </div>

          <div class="flex items-center gap-1.5">
            <UPagination
              v-model:page="page"
              :total="users?.data?.meta?.total || 0"
              :items-per-page="pageSize"
            />
          </div>
        </div>
      </UDashboardPanelContent>
    </template>
  </UDashboardPanel>
</template>
```
