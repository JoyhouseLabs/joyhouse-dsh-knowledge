import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const PACKAGE_NAME = '@joyhouse/dsh-knowledge'
const NODE_EXTERNALS = new Set([
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-home-paths',
])
const CLIENT_EXTERNALS = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-layout/client',
  '@deepseek-ai/dsh-client-ui-sidebar/client',
  '@deepseek-ai/dsh-client-ui-slots',
])

export default defineConfig([
  {
    name: PACKAGE_NAME,
    entry: {
      index: 'src/index.ts',
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: (id: string) => (NODE_EXTERNALS.has(id) || id.startsWith('node:')),
      alwaysBundle: (id: string) => !(NODE_EXTERNALS.has(id) || id.startsWith('node:')),
    },
  },
  {
    name: `${PACKAGE_NAME}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // Metadata editing must bundle YAML's browser entry, never its Node process dependency.
    alias: { yaml: fileURLToPath(new URL('./node_modules/yaml/browser/index.js', import.meta.url)) },
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    deps: {
      neverBundle: (id: string) => CLIENT_EXTERNALS.has(id),
      alwaysBundle: (id: string) => !CLIENT_EXTERNALS.has(id),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
