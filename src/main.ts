import { bootRenderer } from './rendering/app';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app mount element not found');
}

void bootRenderer(host);
