export type ComponentStatus = 'draft' | 'review' | 'published';
export type PreviewTheme = 'light' | 'dark';
export type PreviewDensity = 'compact' | 'regular' | 'spacious';

export interface PropertySpec {
  id: string;
  name: string;
  type: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

export interface ComponentExample {
  id: string;
  title: string;
  code: string;
  propertyIds: string[];
  /** 最近一次校验（创建或迁移）时的组件版本。 */
  validatedRevision: number;
  /** 最近一次校验时组件的交互签名。 */
  validatedSignature: string;
  /** 校验时示例引用到的属性名（含已从契约中移除的）。 */
  affectedProperties: string[];
  /** 逐份迁移记录，最新在前。 */
  migrations: ExampleMigration[];
}

export interface ExampleMigration {
  id: string;
  /** 迁移前示例的校验版本。 */
  fromRevision: number;
  /** 迁移到的组件契约版本。 */
  toRevision: number;
  /** 触发本次迁移的失效原因。 */
  reasons: string[];
  migratedAt: string;
}

export interface ComponentSpec {
  id: string;
  name: string;
  category: string;
  status: ComponentStatus;
  purpose: string;
  usage: string;
  properties: PropertySpec[];
  states: string;
  keyboardBehavior: string;
  screenReader: string;
  disabledScenarios: string;
  interactionSignature: string;
  examples: ComponentExample[];
  revision: number;
  updatedAt: string;
  snapshots: ComponentSnapshot[];
}

export interface ComponentSnapshot {
  revision: number;
  savedAt: string;
  reason: string;
  component: Omit<ComponentSpec, 'snapshots'>;
}

export interface WorkspaceState {
  components: ComponentSpec[];
  selectedId: string;
}

export interface ValidationIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  componentId: string;
  target: string;
  message: string;
  field: 'properties' | 'examples' | 'keyboard' | 'screenReader';
}

export interface DiffRow {
  field: string;
  before: string;
  after: string;
}
