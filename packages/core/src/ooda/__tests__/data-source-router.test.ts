// packages/core/src/ooda/__tests__/data-source-router.test.ts
// 功能测试: 错误分类器

import { describe, it, expect } from 'vitest';
import { getErrorClassifier } from '../error-classifier';

describe('ErrorClassifier', () => {
  it('should get classifier instance', () => {
    const classifier = getErrorClassifier();
    expect(classifier).toBeDefined();
  });
});