import { readdirSync, statSync } from 'fs';
import { join } from 'path';

import { APP_ONLY_ROUTES, WEB_ROUTES } from './web-site';

/** Top-level route names as the root Stack sees them: files, and folders without a layout. */
function rootRoutes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === '__tests__') return [];
      if (readdirSync(path).includes('_layout.tsx')) return [prefix + name];
      return rootRoutes(path, `${prefix}${name}/`);
    }
    if (!/\.tsx?$/.test(name) || name.startsWith('_') || name.includes('.test.')) return [];
    return [prefix + name.replace(/\.tsx?$/, '')];
  });
}

test('every route is either on the website or guarded off it', () => {
  const routes = rootRoutes(join(__dirname, '..', 'app')).sort();
  expect([...WEB_ROUTES, ...APP_ONLY_ROUTES].sort()).toEqual(routes);
});
