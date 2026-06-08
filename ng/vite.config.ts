import {defineConfig} from 'vite';
import path from 'node:path';
import {readFileSync} from 'node:fs';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	server: {
		host: '0.0.0.0',
		port: 5173,
		open: true,
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
		emptyOutDir: true,
	},
});
