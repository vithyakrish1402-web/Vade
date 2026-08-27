import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { protect, type ProtectionMode } from '../src/utils/protectedText/protectedTextEngine';
import { classifyIntent } from '../src/utils/protectedText/intentClassifier';

interface Vector {
  description: string;
  input: string;
  mode: ProtectionMode;
  rendererVersion: number;
  expected: string;
  expectedIntent?: string;
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const vectorsPath = path.resolve(dirname, '../../docs/test-vectors/protected-text-v2-test-vectors.json');
const { vectors } = JSON.parse(readFileSync(vectorsPath, 'utf8')) as { vectors: Vector[] };

// Cross-platform Protected Text v2 test vectors — a single source of truth shared with the
// Android module's JUnit suite (ProtectedTextV2CrossPlatformTest.kt). Both must produce
// byte-identical `expected` output for every vector, and identical `expectedIntent`
// classification where present.
describe('Protected Text v2 cross-platform vectors', () => {
  it('loads a non-empty vector set', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const vector of vectors) {
    it(`[${vector.mode}] ${vector.description}`, () => {
      expect(protect(vector.input, vector.mode)).toBe(vector.expected);
      if (vector.expectedIntent) {
        expect(classifyIntent(vector.input)).toBe(vector.expectedIntent);
      }
    });
  }
});
