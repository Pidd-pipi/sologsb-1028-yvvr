import type { ComponentExample, ComponentSpec } from './types';

export interface ExampleStaleness {
  stale: boolean;
  reasons: string[];
  /** 代码仍引用、但契约中已移除的属性名。 */
  removedProperties: string[];
  /** 校验时的交互签名与当前签名不一致。 */
  signatureChanged: boolean;
}

const currentPropertyNames = (component: ComponentSpec): Set<string> =>
  new Set(component.properties.map((property) => property.name.trim()).filter(Boolean));

/**
 * 汇总示例当前引用到的属性名：显式勾选的依赖 + 代码中出现的属性名。
 * previous 中已从契约移除、但代码仍引用的名称会被保留，避免编辑示例后丢失失效线索。
 */
export function collectAffectedProperties(
  component: ComponentSpec,
  example: Pick<ComponentExample, 'code' | 'propertyIds'>,
  previous: string[] = []
): string[] {
  const names = new Set<string>();
  const nameById = new Map(component.properties.map((property) => [property.id, property.name.trim()]));
  example.propertyIds.forEach((id) => {
    const name = nameById.get(id);
    if (name) names.add(name);
  });
  component.properties.forEach((property) => {
    const name = property.name.trim();
    if (name && example.code.includes(name)) names.add(name);
  });
  const active = currentPropertyNames(component);
  previous.forEach((name) => {
    if (!active.has(name) && example.code.includes(name)) names.add(name);
  });
  return [...names].sort();
}

/**
 * 逐份判断示例是否失效：只有代码仍引用已移除属性名，或校验时的交互签名
 * 与当前签名不一致时才标记。其它契约编辑（新增属性、改说明等）不影响示例。
 */
export function getExampleStaleness(component: ComponentSpec, example: ComponentExample): ExampleStaleness {
  const active = currentPropertyNames(component);
  const removedNames = example.affectedProperties.filter((name) => !active.has(name));
  const removedInCode = removedNames.filter((name) => example.code.includes(name));
  const removedOnlyLinked = removedNames.filter((name) => !example.code.includes(name));
  const danglingIds = example.propertyIds.filter((id) => !component.properties.some((property) => property.id === id));
  const signatureChanged = example.validatedSignature !== component.interactionSignature;
  const reasons: string[] = [];
  if (removedInCode.length) {
    reasons.push(`代码仍引用已移除属性：${removedInCode.join('、')}。`);
  }
  if (removedOnlyLinked.length) {
    reasons.push(`示例关联的属性已删除：${removedOnlyLinked.join('、')}。`);
  }
  if (danglingIds.length && !removedNames.length) {
    reasons.push('示例仍关联已删除的属性，迁移时将清理。');
  }
  if (signatureChanged) {
    reasons.push(`交互签名已变化（校验时为「${example.validatedSignature || '（空）'}」）。`);
  }
  return { stale: reasons.length > 0, reasons, removedProperties: removedNames, signatureChanged };
}
