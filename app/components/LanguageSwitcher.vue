<script setup lang="ts">
import type { AppLocale } from '~/composables/useAppLocale'

defineProps<{ collapsed?: boolean }>()

const { locale, setLocale, t } = useAppLocale()
const options: Array<{ value: AppLocale, label: string }> = [
  { value: 'th', label: 'ไทย' },
  { value: 'lo', label: 'ລາວ' },
  { value: 'en', label: 'EN' }
]
</script>

<template>
  <div class="flex items-center gap-1 px-1 py-1" :class="collapsed ? 'flex-col' : 'justify-center'" :aria-label="t('language.label')">
    <UButton
      v-for="option in options"
      :key="option.value"
      :label="collapsed ? undefined : option.label"
      :aria-label="t(`language.${option.value}`)"
      :variant="locale === option.value ? 'soft' : 'ghost'"
      :color="locale === option.value ? 'primary' : 'neutral'"
      :square="collapsed"
      size="xs"
      class="min-w-8 justify-center"
      @click="setLocale(option.value)"
    >
      <span v-if="collapsed">{{ option.value.toUpperCase() }}</span>
    </UButton>
  </div>
</template>
