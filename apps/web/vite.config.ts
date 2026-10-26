/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Em desenvolvimento, /api vai para a API local. Em produção o front e a API ficam atrás do mesmo endereço.
  server: { proxy: { '/api': 'http://127.0.0.1:4100' } },
  test: { testTimeout: 30_000, environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'] },
});
