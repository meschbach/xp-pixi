import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const DOM_GLOBAL_MESSAGE =
  'Simulation must stay pure: no DOM/browser globals. Rendering owns pixels.';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/simulation/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*'],
              message:
                'Simulation must not import PixiJS. It operates in pure graph space.',
            },
            {
              group: ['**/*.css', '**/*.html', '**/*.svg', '**/*.png', '**/*.jpg'],
              message:
                'Simulation must not import assets or DOM-related modules.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: DOM_GLOBAL_MESSAGE },
        { name: 'document', message: DOM_GLOBAL_MESSAGE },
        { name: 'navigator', message: DOM_GLOBAL_MESSAGE },
        { name: 'localStorage', message: DOM_GLOBAL_MESSAGE },
        { name: 'sessionStorage', message: DOM_GLOBAL_MESSAGE },
        { name: 'requestAnimationFrame', message: DOM_GLOBAL_MESSAGE },
        { name: 'cancelAnimationFrame', message: DOM_GLOBAL_MESSAGE },
        { name: 'getComputedStyle', message: DOM_GLOBAL_MESSAGE },
        { name: 'alert', message: DOM_GLOBAL_MESSAGE },
        { name: 'confirm', message: DOM_GLOBAL_MESSAGE },
        { name: 'prompt', message: DOM_GLOBAL_MESSAGE },
        { name: 'HTMLElement', message: DOM_GLOBAL_MESSAGE },
        { name: 'HTMLCanvasElement', message: DOM_GLOBAL_MESSAGE },
        { name: 'HTMLIFrameElement', message: DOM_GLOBAL_MESSAGE },
        { name: 'Element', message: DOM_GLOBAL_MESSAGE },
        { name: 'Node', message: DOM_GLOBAL_MESSAGE },
        { name: 'EventTarget', message: DOM_GLOBAL_MESSAGE },
      ],
    },
  }
);
