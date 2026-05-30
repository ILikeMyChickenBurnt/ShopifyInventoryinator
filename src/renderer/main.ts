import { createApp, type Component } from 'vue';

// This is the production bootstrap for the modern renderer.
// It is now the primary renderer entry point used by the desktop app.

import App from './App.vue';

const app = createApp(App as Component);
app.mount('#app');

console.log('%c[Production Renderer] Modern Vue 3 + TS renderer mounted', 'color: #10b981');
