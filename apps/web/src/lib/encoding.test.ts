import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('textos da interface', () => {
  it('nenhum arquivo de código tem caractere corrompido (acentos quebrados)', () => {
    const roots = [resolve(__dirname, '..'), resolve(__dirname, '../../../../packages/shared/src')];
    const broken = roots
      .flatMap(files)
      .filter((f) => /\.(ts|tsx|css|html)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes('\uFFFD'));
    expect(broken).toEqual([]);
  });
});
