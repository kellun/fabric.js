import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

// https://github.com/artberri/rollup-plugin-istanbul

// https://rollupjs.org/guide/en/#configuration-files
export default {
  external: ['qunit', 'fabric'],
  input: ['test/unit/index.ts', 'test/visual/index.ts'],
  output: [
    {
      dir: 'cli_output/test',
      format: 'cjs',
      exports: 'named',
      preserveModules: true, // Keep directory structure and files
    },
  ],
  plugins: [
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json'
    }),
  ],
};
