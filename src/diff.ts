import type { ComponentExample, ComponentSnapshot, ComponentSpec, DiffRow, PropertySpec } from './types';

const selectedFields: Array<Exclude<keyof ComponentSpec, 'snapshots'>> = [
  'name', 'category', 'status', 'purpose', 'usage', 'states', 'keyboardBehavior', 'screenReader', 'disabledScenarios', 'interactionSignature'
];

const fieldLabels: Record<string, string> = {
  name: '名称',
  category: '分类',
  status: '状态',
  purpose: '用途',
  usage: '使用规则',
  states: '状态说明',
  keyboardBehavior: '键盘行为',
  screenReader: '读屏说明',
  disabledScenarios: '禁用场景',
  interactionSignature: '交互签名'
};

const formatProperty = (property: PropertySpec): string =>
  `${property.name}: ${property.type}${property.required ? '（必填）' : ''}${property.defaultValue ? ` = ${property.defaultValue}` : ''} — ${property.description}`;

const formatExample = (example: ComponentExample): string =>
  [
    `校验版本 r${example.validatedRevision} · 签名「${example.validatedSignature || '（空）'}」 · 迁移 ${example.migrations.length} 次`,
    example.code
  ].join('\n');

export function diffAgainstSnapshot(component: ComponentSpec, snapshot?: ComponentSnapshot): DiffRow[] {
  if (!snapshot) return [];
  const rows: DiffRow[] = [];
  for (const field of selectedFields) {
    const before = String(snapshot.component[field] ?? '');
    const after = String(component[field] ?? '');
    if (before !== after) rows.push({ field: fieldLabels[field] ?? String(field), before, after });
  }

  const beforeProperties = new Map(snapshot.component.properties.map((property) => [property.id, property]));
  const afterProperties = new Map(component.properties.map((property) => [property.id, property]));
  for (const [id, after] of afterProperties) {
    const before = beforeProperties.get(id);
    if (!before) {
      rows.push({ field: `属性 ${after.name}`, before: '（新增）', after: formatProperty(after) });
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({ field: `属性 ${after.name}`, before: formatProperty(before), after: formatProperty(after) });
    }
  }
  for (const [id, before] of beforeProperties) {
    if (!afterProperties.has(id)) rows.push({ field: `属性 ${before.name}`, before: formatProperty(before), after: '（已删除）' });
  }

  const beforeExamples = new Map(snapshot.component.examples.map((example) => [example.id, example]));
  const afterExamples = new Map(component.examples.map((example) => [example.id, example]));
  for (const [id, after] of afterExamples) {
    const before = beforeExamples.get(id);
    if (!before) {
      rows.push({ field: `示例 ${after.title}（迁入）`, before: '（新增）', after: formatExample(after) });
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      rows.push({ field: `示例 ${after.title}`, before: formatExample(before), after: formatExample(after) });
    }
  }
  for (const [id, before] of beforeExamples) {
    if (!afterExamples.has(id)) rows.push({ field: `示例 ${before.title}（迁出）`, before: formatExample(before), after: '（已移除）' });
  }
  return rows;
}
