import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const storageRoute = readFileSync(
  fileURLToPath(new URL('./storage.ts', import.meta.url)),
  'utf8',
);

test('public image authorization uses path-specific reference EXISTS checks', () => {
  const helper = storageRoute.match(
    /async function isPublicImageReference[\s\S]*?\n}\n/,
  )?.[0];
  assert.ok(helper, 'public image reference helper should exist');
  assert.equal((helper.match(/EXISTS\s*\(/g) ?? []).length, 4);
  assert.match(helper, /p\.image_url = \$\{path\}/);
  assert.match(helper, /p\.gallery @> \$\{JSON\.stringify\(\[path\]\)\}::jsonb/);
  assert.match(helper, /b\.image_url = \$\{path\}/);
  assert.match(helper, /b\.gallery @> \$\{JSON\.stringify\(\[path\]\)\}::jsonb/);
  assert.match(helper, /bi\.url = \$\{path\}/);
  assert.match(helper, /c\.image_url = \$\{path\}/);
  assert.doesNotMatch(helper, /\.select\(\s*\{\s*imageUrl/);
});

test('inactive image access is path-scoped and staff-gated', () => {
  const helper = storageRoute.match(
    /async function isInactiveImageReference[\s\S]*?\n}\n/,
  )?.[0];
  assert.ok(helper, 'inactive image reference helper should exist');
  assert.equal((helper.match(/EXISTS\s*\(/g) ?? []).length, 4);
  assert.match(helper, /p\.status <> 'active'/);
  assert.match(helper, /b\.status <> 'active' OR b\.active = false/);
  assert.match(helper, /bi\.active = false/);
  assert.match(helper, /c\.active = false/);
  assert.match(helper, /image_url = \$\{path\}/);
  assert.match(storageRoute, /INACTIVE_IMAGE_VIEW_ROLES\.has\(user\.role\)/);
  assert.match(storageRoute, /canViewInactiveCatalogImage[\s\S]*?catalogImageContentType/);
  assert.match(storageRoute, /'private, no-store'/);
});

test('public images are revalidated on each browser request', () => {
  assert.match(storageRoute, /public, max-age=0, must-revalidate/);
});