import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

describe('package.json "build:image" script', () => {
  const script: string = pkg.scripts['build:image'];

  it('is defined', () => {
    expect(script).toBeTruthy();
  });

  it('passes GIT_COMMIT as a build-arg', () => {
    expect(script).toMatch(/--build-arg GIT_COMMIT=\$\(git rev-parse --short HEAD\)/);
  });

  it('passes BUILD_DATE as a build-arg', () => {
    expect(script).toMatch(/--build-arg BUILD_DATE=\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)/);
  });

  it('tags the image using a configurable IMAGE env var with a default', () => {
    expect(script).toMatch(/-t \$\{IMAGE:-[^}]+\}:/);
  });

  it('tags the image with the short commit SHA', () => {
    expect(script).toMatch(/:\$\(git rev-parse --short HEAD\)\s+\.$/);
  });
});
