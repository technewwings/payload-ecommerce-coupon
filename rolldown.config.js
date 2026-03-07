const external = ['payload', '@payloadcms/plugin-ecommerce']

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
    external,
  },
  {
    input: 'src/browser.ts',
    output: [
      {
        file: 'dist/browser.js',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/browser.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
    external,
  },
]
