// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    'nuxt-auth-utils'
  ],

  devtools: {
    enabled: true
  },

  devServer: {
    host: '0.0.0.0',
    port: 3000
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      // Disabled explicit cors to avoid credential issues on same-origin IP access
      // cors: true 
    }
  },

  runtimeConfig: {
    secretKey: process.env.SECRET_KEY || '',
    oneVisionDataRoot: process.env.ONEVISION_DATA_ROOT || process.env.CAR_SCAN_OUTPUT_DIR || '',
    cvat: {
      baseUrl: process.env.CVAT_BASE_URL || '',
      username: process.env.CVAT_USERNAME || '',
      password: process.env.CVAT_PASSWORD || '',
      tlsRejectUnauthorized: process.env.CVAT_TLS_REJECT_UNAUTHORIZED || 'true'
    },
    public: {
      oneVisionWebSocketUrl: process.env.NUXT_PUBLIC_ONE_VISION_WEBSOCKET_URL || '',
      passwordEncryptionKey: process.env.NUXT_PUBLIC_PASSWORD_ENCRYPTION_KEY || process.env.SECRET_KEY || ''
    },
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
      cookie: {
        secure: false, // Ensure cookies work on HTTP IP access
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      }
    }
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
