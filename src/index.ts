/**
 * DITS - Dependency Injection TypeScript
 * A TypeScript replica of Scala's distage-core library
 */

// Core
export { Injector } from '@/core/Injector';
export type { InjectorOptions } from '@/core/Injector';
export { Planner } from '@/core/Planner';
export { Producer } from '@/core/Producer';
export type { Locator } from '@/core/Locator';
export { LocatorImpl } from '@/core/Locator';
export { Subcontext, createSubcontext } from '@/core/Subcontext';
export {
  Plan,
  PlanningError,
  MissingDependencyError,
  CircularDependencyError,
  ConflictingBindingsError,
} from '@/core/Plan';
export type { PlanStep } from '@/core/Plan';
export { Functoid, getConstructorParameters, getConstructorDependencies } from '@/core/Functoid';
export type { ParameterInfo } from '@/core/Functoid';

// DSL
export { ModuleDef, BindingBuilder, SetBindingBuilder } from '@/dsl/ModuleDef';

// Model
export { DIKey, ID_METADATA_KEY, PARAM_IDS_METADATA_KEY } from '@/model/DIKey';
export { Id, getParameterId, getAllParameterIds } from '@/model/Id';
export { Injectable } from '@/model/Injectable';
export { Axis, AxisPoint, Activation, BindingTags } from '@/model/Activation';
export { BindingKind, Bindings } from '@/model/Binding';
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
} from '@/model/Binding';
export { Lifecycle, LifecycleManager, AggregateLifecycleError } from '@/model/Lifecycle';

// Re-export reflect-metadata for convenience
import 'reflect-metadata';
