import type { ComponentExample, ComponentSnapshot, ComponentSpec, DiffRow, PropertySpec } from './types';

const selectedFields = [
  'name', 'category', 'status', 'purpose', 'usage', 'states',
  'keyboardBehavior', 'screenReader', 'disabledScenarios', 'interactionSignature'
] as const satisfies ReadonlyArray<keyof Omit<ComponentSpec, 'snapshots'>>;

const fieldLabels: Record<(typeof selectedFields)[number], string> = {
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

const describeProperty = (property: PropertySpec): string =>
  `${property.type}${property.required ? ' · 必填' : ''} · 默认 ${property.defaultValue || '（空）'} · ${property.description}`;

const summarizeExample = (example: ComponentExample): string =>
  `校验版本 r${example.validatedRevision} · 签名「${example.validatedSignature || '空'}」\n${example.code}`;

const exampleChanged = (before: ComponentExample, after: ComponentExample): boolean =>
  before.title !== after.title ||
  before.code !== after.code ||
  before.validatedRevision !== after.validatedRevision ||
  before.validatedSignature !== after.validatedSignature ||
  JSON.stringify(before.propertyIds) !== JSON.stringify(after.propertyIds) ||
  JSON.stringify(before.affectedItems) !== JSON.stringify(after.affectedItems);

export function diffAgainstSnapshot(component: ComponentSpec, snapshot?: ComponentSnapshot): DiffRow[] {
  if (!snapshot) return [];
  const rows: DiffRow[] = [];

  for (const field of selectedFields) {
    const before = String(snapshot.component[field] ?? '');
    const after = String(component[field] ?? '');
    if (before !== after) rows.push({ field: fieldLabels[field], before, after });
  }

  const beforeProperties = new Map(snapshot.component.properties.map((property) => [property.name, property]));
  const afterProperties = new Map(component.properties.map((property) => [property.name, property]));
  for (const [name, property] of afterProperties) {
    const before = beforeProperties.get(name);
    if (!before) rows.push({ field: `属性新增 · ${name}`, before: '', after: describeProperty(property) });
    else if (JSON.stringify(before) !== JSON.stringify(property)) {
      rows.push({ field: `属性变更 · ${name}`, before: describeProperty(before), after: describeProperty(property) });
    }
  }
  for (const [name, property] of beforeProperties) {
    if (!afterProperties.has(name)) rows.push({ field: `属性移除 · ${name}`, before: describeProperty(property), after: '' });
  }

  const beforeExamples = new Map(snapshot.component.examples.map((example) => [example.id, example]));
  const afterExamples = new Map(component.examples.map((example) => [example.id, example]));
  for (const example of component.examples) {
    const before = beforeExamples.get(example.id);
    if (!before) {
      rows.push({ field: `示例新增 · ${example.title}`, before: '', after: summarizeExample(example) });
      continue;
    }
    const migrated = example.migrations.length > before.migrations.length
      || before.validatedRevision !== example.validatedRevision
      || before.validatedSignature !== example.validatedSignature;
    if (migrated) {
      const record = example.migrations[0];
      rows.push({
        field: `示例迁入 · ${example.title}`,
        before: `校验版本 r${before.validatedRevision} · 签名「${before.validatedSignature || '空'}」`,
        after: `校验版本 r${example.validatedRevision} · 签名「${example.validatedSignature || '空'}」${record ? `\n迁移原因：${record.reason}` : ''}`
      });
      continue;
    }
    if (exampleChanged(before, example)) {
      rows.push({ field: `示例更新 · ${example.title}`, before: summarizeExample(before), after: summarizeExample(example) });
    }
  }
  for (const example of snapshot.component.examples) {
    if (!afterExamples.has(example.id)) {
      rows.push({ field: `示例迁出 · ${example.title}`, before: summarizeExample(example), after: '' });
    }
  }

  return rows;
}
