/**
 * distage - Dependency Injection TypeScript
 * A TypeScript replica of Scala's distage-core library
 */

// Core
export { Injector } from '@/distage/core/Injector';
export type { InjectorOptions } from '@/distage/core/Injector';
export { Planner } from '@/distage/core/Planner';
export { Producer } from '@/distage/core/Producer';
export type { Locator } from '@/distage/core/Locator';
export { LocatorImpl } from '@/distage/core/Locator';
export { Subcontext, createSubcontext } from '@/distage/core/Subcontext';
export {
  Plan,
  PlanningError,
  MissingDependencyError,
  CircularDependencyError,
  ConflictingBindingsError,
} from '@/distage/core/Plan';
export type { PlanStep } from '@/distage/core/Plan';
export { Functoid } from '@/distage/core/Functoid';
export type { ParameterInfo } from '@/distage/core/Functoid';

// DSL
export { ModuleDef, BindingBuilder, SetBindingBuilder } from '@/distage/dsl/ModuleDef';

// Model
export { DIKey, ID_METADATA_KEY, PARAM_IDS_METADATA_KEY, TypeTag } from '@/distage/model/DIKey';
export type { Callable, TypeTag as TypeTagType, PrimitiveType } from '@/distage/model/DIKey';
export { Id, getParameterId, getAllParameterIds } from '@/distage/model/Id';
export { Reflected, ApplyReflection, getConstructorTypes } from '@/distage/model/Reflected';
export { Axis, AxisPoint, Activation, BindingTags } from '@/distage/model/Activation';
export { BindingKind, Bindings } from '@/distage/model/Binding';
export type {
  Binding,
  InstanceBinding,
  ClassBinding,
  FactoryBinding,
  AliasBinding,
  SetBinding,
  WeakSetBinding,
  AssistedFactoryBinding,
  AnyBinding,
} from '@/distage/model/Binding';
export { Lifecycle, LifecycleManager, AggregateLifecycleError } from '@/distage/model/Lifecycle';
