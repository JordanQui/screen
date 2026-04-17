export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  app: {
    head: {
      title: 'Wav Screen',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'theme-color', content: '#000000' },
      ],
      style: [
        { innerHTML: 'html,body{background:#000!important}' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      reloadIntervalMs: 120000,
      micResetMs: 240000,
      deviceProfile: '',   // override via NUXT_PUBLIC_DEVICE_PROFILE=raspberry
    },
  },
})
