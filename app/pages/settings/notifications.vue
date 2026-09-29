<script setup lang="ts">
const state = reactive<{ [key: string]: boolean }>({
  email: true,
  desktop: false,
  product_updates: true,
  weekly_digest: false,
  important_updates: true
})
const { t } = useAppLocale()

const sections = [{
  title: 'settings.notifications',
  description: 'notifications.channelsDescription',
  fields: [{
    name: 'email',
    label: 'notifications.email',
    description: 'notifications.emailDescription'
  }, {
    name: 'desktop',
    label: 'notifications.desktop',
    description: 'notifications.desktopDescription'
  }]
}, {
  title: 'notifications.accountUpdates',
  description: 'notifications.accountUpdatesDescription',
  fields: [{
    name: 'weekly_digest',
    label: 'notifications.weeklyDigest',
    description: 'notifications.weeklyDigestDescription'
  }, {
    name: 'product_updates',
    label: 'notifications.productUpdates',
    description: 'notifications.productUpdatesDescription'
  }, {
    name: 'important_updates',
    label: 'notifications.importantUpdates',
    description: 'notifications.importantUpdatesDescription'
  }]
}]

async function onChange() {
  // Do something with data
  console.log(state)
}
</script>

<template>
  <div v-for="(section, index) in sections" :key="index">
    <UPageCard
      :title="t(section.title)"
      :description="t(section.description)"
      variant="naked"
      class="mb-4"
    />

    <UPageCard variant="subtle" :ui="{ container: 'divide-y divide-default' }">
      <UFormField
        v-for="field in section.fields"
        :key="field.name"
        :name="field.name"
        :label="t(field.label)"
        :description="t(field.description)"
        class="flex items-center justify-between not-last:pb-4 gap-2"
      >
        <USwitch
          v-model="state[field.name]"
          @update:model-value="onChange"
        />
      </UFormField>
    </UPageCard>
  </div>
</template>
