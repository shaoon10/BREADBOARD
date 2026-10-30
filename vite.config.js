import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// JS·CSS를 index.html 하나에 모두 넣어서 서버 없이 더블클릭으로도 열리게 한다.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
});
