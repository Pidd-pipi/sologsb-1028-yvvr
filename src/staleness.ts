import type { ComponentExample, ComponentSpec } from './types';

export const SIGNATURE_ITEM = '交互签名';

export interface ExampleStaleness {
  stale: boolean;
  reasons: string[];
  affectedItems: string[];
}

/**
 * 逐份评估示例是否失效。只有两种情况会标记：
 * 1. 组件交互签名与示例校验时记录的签名不一致；
 * 2. 示例代码仍引用已移除的属性名，或属性依赖仍指向已删除的属性。
 */
export function evaluateExample(component: ComponentSpec, example: ComponentExample): ExampleStaleness {
  const reasons: string[] = [];
  const affected: string[] = [];

  if (example.validatedSignature !== component.interactionSignature) {
    affected.push(SIGNATURE_ITEM);
    reasons.push(`交互签名较校验版本 r${example.validatedRevision} 已变化，需要按当前契约重新验证。`);
  }

  const activeIds = new Set(component.properties.map((property) => property.id));
  const activeNames = new Set(component.properties.map((property) => property.name));
  const removedNames = example.affectedItems.filter((name) => name !== SIGNATURE_ITEM && !activeNames.has(name));

  const referencedInCode = removedNames.filter((name) => name && example.code.includes(name));
  if (referencedInCode.length) {
    affected.push(...referencedInCode);
    reasons.push(`代码仍引用已移除的属性：${referencedInCode.join('、')}。`);
  }

  const missingDependencies = example.propertyIds.filter((id) => !activeIds.has(id));
  if (missingDependencies.length) {
    const dependencyNames = removedNames.filter((name) => !referencedInCode.includes(name));
    affected.push(...(dependencyNames.length ? dependencyNames : [`${missingDependencies.length} 个已删除属性`]));
    reasons.push('示例的属性依赖仍指向已删除的属性。');
  }

  return { stale: reasons.length > 0, reasons, affectedItems: [...new Set(affected)] };
}
