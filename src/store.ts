import { createInitialState } from './data';
import { evaluateExample } from './staleness';
import type { ComponentExample, ComponentSnapshot, ComponentSpec, ValidationIssue, WorkspaceState } from './types';

const STORAGE_KEY = 'sologsb-1028-workspace-v1';

const clone = <T>(value: T): T => structuredClone(value);
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeExample = (raw: any, componentRevision: number, componentSignature: string): ComponentExample => {
  const legacyStale = Boolean(raw?.stale);
  return {
    id: String(raw?.id ?? uid('example')),
    title: String(raw?.title ?? '示例'),
    code: String(raw?.code ?? ''),
    propertyIds: Array.isArray(raw?.propertyIds) ? raw.propertyIds.filter((id: unknown) => typeof id === 'string') : [],
    validatedRevision: Number(raw?.validatedRevision ?? raw?.createdFromRevision ?? componentRevision),
    validatedSignature: typeof raw?.validatedSignature === 'string'
      ? raw.validatedSignature
      : legacyStale ? `${componentSignature}（旧版）` : componentSignature,
    affectedItems: Array.isArray(raw?.affectedItems) ? raw.affectedItems.filter((item: unknown) => typeof item === 'string') : [],
    migrations: Array.isArray(raw?.migrations) ? raw.migrations : []
  };
};

const normalizeComponent = (raw: any): ComponentSpec => {
  const revision = Number(raw?.revision ?? 1);
  const interactionSignature = String(raw?.interactionSignature ?? '');
  const examples = (Array.isArray(raw?.examples) ? raw.examples : []).map((item: any) => normalizeExample(item, revision, interactionSignature));
  const snapshots = (Array.isArray(raw?.snapshots) ? raw.snapshots : []).map((snapshot: any): ComponentSnapshot => {
    const snapshotRevision = Number(snapshot?.revision ?? revision);
    const snapshotSignature = String(snapshot?.component?.interactionSignature ?? '');
    return {
      revision: snapshotRevision,
      savedAt: String(snapshot?.savedAt ?? new Date().toISOString()),
      reason: String(snapshot?.reason ?? ''),
      component: {
        ...snapshot?.component,
        properties: Array.isArray(snapshot?.component?.properties) ? snapshot.component.properties : [],
        examples: (Array.isArray(snapshot?.component?.examples) ? snapshot.component.examples : [])
          .map((item: any) => normalizeExample(item, snapshotRevision, snapshotSignature))
      }
    };
  });
  return {
    id: String(raw?.id ?? uid('component')),
    name: String(raw?.name ?? 'Untitled component'),
    category: String(raw?.category ?? 'Uncategorised'),
    status: raw?.status ?? 'draft',
    purpose: String(raw?.purpose ?? ''),
    usage: String(raw?.usage ?? ''),
    properties: Array.isArray(raw?.properties) ? raw.properties : [],
    states: String(raw?.states ?? ''),
    keyboardBehavior: String(raw?.keyboardBehavior ?? ''),
    screenReader: String(raw?.screenReader ?? ''),
    disabledScenarios: String(raw?.disabledScenarios ?? ''),
    interactionSignature,
    examples,
    revision,
    updatedAt: String(raw?.updatedAt ?? new Date().toISOString()),
    snapshots
  };
};

const normalizeState = (raw: any): WorkspaceState => {
  const components: ComponentSpec[] = (Array.isArray(raw?.components) ? raw.components : []).map(normalizeComponent);
  const selectedId = components.some((item) => item.id === raw?.selectedId) ? raw.selectedId : components[0]?.id ?? '';
  return { components, selectedId };
};

export class SpecStore extends EventTarget {
  state: WorkspaceState;
  private undoStack: WorkspaceState[] = [];
  private redoStack: WorkspaceState[] = [];
  private lastAction = '';

  constructor() {
    super();
    this.state = this.load();
  }

  get selected(): ComponentSpec | undefined {
    return this.state.components.find((item) => item.id === this.state.selectedId);
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get lastUndoLabel() { return this.lastAction; }

  select(id: string) {
    if (!this.state.components.some((item) => item.id === id)) return;
    this.state = { ...this.state, selectedId: id };
    this.persist(false);
    this.emit();
  }

  addComponent() {
    const id = uid('component');
    const component: ComponentSpec = {
      id,
      name: 'Untitled component',
      category: 'Uncategorised',
      status: 'draft',
      purpose: '说明该组件解决的用户问题。',
      usage: '说明何时使用、何时不要使用。',
      properties: [],
      states: 'default、hover、focus-visible、disabled。',
      keyboardBehavior: '记录 Tab、Enter、Space、方向键和 Esc 等行为。',
      screenReader: '记录角色、名称、状态和动态播报。',
      disabledScenarios: '记录不应使用该组件的场景。',
      interactionSignature: '',
      examples: [],
      revision: 1,
      updatedAt: new Date().toISOString(),
      snapshots: []
    };
    this.commit('新建组件', (state) => {
      state.components.unshift(component);
      state.selectedId = id;
    });
  }

  updateComponent(patch: Partial<ComponentSpec>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑组件', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      Object.assign(target, patch, { updatedAt: new Date().toISOString() });
    });
  }

  addProperty() {
    const selected = this.selected;
    if (!selected) return;
    this.commit('新增属性', (state) => {
      state.components.find((item) => item.id === selected.id)?.properties.push({
        id: uid('property'),
        name: 'newProperty',
        type: 'string',
        required: false,
        defaultValue: '',
        description: '描述该属性对开发者和用户的影响。'
      });
    });
  }

  updateProperty(propertyId: string, patch: Partial<ComponentSpec['properties'][number]>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const property = target?.properties.find((item) => item.id === propertyId);
      if (!target || !property) return;
      const previousName = property.name;
      Object.assign(property, patch);
      target.updatedAt = new Date().toISOString();
      if (patch.name !== undefined && patch.name !== previousName && previousName.trim()) {
        this.recordAffectedProperty(target, previousName);
      }
    });
  }

  removeProperty(propertyId: string) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('删除属性', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const property = target?.properties.find((item) => item.id === propertyId);
      if (!target || !property) return;
      target.properties = target.properties.filter((item) => item.id !== propertyId);
      target.updatedAt = new Date().toISOString();
      this.recordAffectedProperty(target, property.name, property.id);
    });
  }

  addExample() {
    const selected = this.selected;
    if (!selected) return;
    const exampleId = uid('example');
    this.commit('新增示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      target.examples.push({
        id: exampleId,
        title: '新示例',
        code: `<${target.name.toLowerCase().replaceAll(' ', '-')}>示例</${target.name.toLowerCase().replaceAll(' ', '-')}>`,
        propertyIds: [],
        validatedRevision: target.revision,
        validatedSignature: target.interactionSignature,
        affectedItems: [],
        migrations: []
      });
    });
  }

  updateExample(exampleId: string, patch: Partial<ComponentSpec['examples'][number]>) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('编辑示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const example = target?.examples.find((item) => item.id === exampleId);
      if (example) Object.assign(example, patch);
    });
  }

  removeExample(exampleId: string) {
    const selected = this.selected;
    if (!selected) return;
    this.commit('删除示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (target) target.examples = target.examples.filter((item) => item.id !== exampleId);
    });
  }

  createSnapshot(reason = '手动版本') {
    const selected = this.selected;
    if (!selected) return;
    this.commit('创建版本快照', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      const { snapshots: _ignored, ...component } = clone(target);
      const nextRevision = target.revision + 1;
      const snapshot: ComponentSnapshot = {
        revision: target.revision,
        savedAt: new Date().toISOString(),
        reason,
        component: { ...component, revision: target.revision }
      };
      target.snapshots.unshift(snapshot);
      target.snapshots = target.snapshots.slice(0, 12);
      target.revision = nextRevision;
      target.updatedAt = new Date().toISOString();
    });
  }

  migrateExample(exampleId: string) {
    const selected = this.selected;
    if (!selected) return;
    const example = selected.examples.find((item) => item.id === exampleId);
    if (!example || !evaluateExample(selected, example).stale) return;
    this.commit('迁移示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      const entry = target?.examples.find((item) => item.id === exampleId);
      if (target && entry) this.migrateExampleRecord(target, entry);
    });
  }

  migrateStaleExamples() {
    const selected = this.selected;
    if (!selected) return;
    if (!selected.examples.some((example) => evaluateExample(selected, example).stale)) return;
    this.commit('迁移待迁移示例', (state) => {
      const target = state.components.find((item) => item.id === selected.id);
      if (!target) return;
      target.examples.forEach((example) => this.migrateExampleRecord(target, example));
    });
  }

  validate(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const component of this.state.components) {
      const names = new Map<string, number>();
      component.properties.forEach((property) => names.set(property.name.trim(), (names.get(property.name.trim()) ?? 0) + 1));
      for (const [name, count] of names) {
        if (name && count > 1) {
          issues.push({ id: `${component.id}-duplicate-${name}`, level: 'error', componentId: component.id, target: component.name, message: `属性名称 ${name} 重复。`, field: 'properties' });
        }
      }
      let staleCount = 0;
      component.examples.forEach((example) => {
        const staleness = evaluateExample(component, example);
        if (staleness.stale) {
          staleCount += 1;
          issues.push({ id: `${component.id}-${example.id}-stale`, level: 'warning', componentId: component.id, target: example.title, message: staleness.reasons.join(' '), field: 'examples' });
        }
        if (!example.code.trim()) {
          issues.push({ id: `${component.id}-${example.id}-empty`, level: 'error', componentId: component.id, target: example.title, message: '示例代码不能为空。', field: 'examples' });
        }
      });
      if (!component.keyboardBehavior.trim()) {
        issues.push({ id: `${component.id}-keyboard`, level: 'error', componentId: component.id, target: component.name, message: '缺少键盘行为说明。', field: 'keyboard' });
      }
      if (!component.screenReader.trim()) {
        issues.push({ id: `${component.id}-screenreader`, level: 'error', componentId: component.id, target: component.name, message: '缺少读屏说明。', field: 'screenReader' });
      }
      if (staleCount) {
        issues.push({ id: `${component.id}-contract`, level: 'info', componentId: component.id, target: component.name, message: `${staleCount} 份示例待迁移；逐份迁移会记录原校验版本与原因，其余示例不受影响。`, field: 'examples' });
      }
    }
    return issues;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.state));
    this.state = previous;
    this.persist(false);
    this.emit();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.state));
    this.state = next;
    this.persist(false);
    this.emit();
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
    this.state = createInitialState();
    this.persist(false);
    this.emit();
  }

  private recordAffectedProperty(component: ComponentSpec, name: string, removedId?: string) {
    component.examples.forEach((example) => {
      const references = example.code.includes(name) || (removedId !== undefined && example.propertyIds.includes(removedId));
      if (references && name && !example.affectedItems.includes(name)) {
        example.affectedItems = [...example.affectedItems, name];
      }
    });
  }

  private migrateExampleRecord(component: ComponentSpec, example: ComponentExample) {
    const staleness = evaluateExample(component, example);
    if (!staleness.stale) return;
    const activePropertyIds = new Set(component.properties.map((item) => item.id));
    example.migrations.unshift({
      fromRevision: example.validatedRevision,
      toRevision: component.revision,
      reason: staleness.reasons.join(' '),
      affectedItems: staleness.affectedItems,
      migratedAt: new Date().toISOString()
    });
    example.propertyIds = example.propertyIds.filter((id) => activePropertyIds.has(id));
    example.validatedRevision = component.revision;
    example.validatedSignature = component.interactionSignature;
    example.affectedItems = [];
    component.updatedAt = new Date().toISOString();
  }

  private commit(label: string, mutator: (state: WorkspaceState) => void) {
    const before = clone(this.state);
    const next = clone(this.state);
    mutator(next);
    this.undoStack.push(before);
    this.undoStack = this.undoStack.slice(-40);
    this.redoStack = [];
    this.lastAction = label;
    this.state = next;
    this.persist();
    this.emit();
  }

  private load(): WorkspaceState {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeState(JSON.parse(saved));
    } catch {
      // A corrupted local draft falls back to the bundled demo data.
    }
    return createInitialState();
  }

  private persist(_notify = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}
