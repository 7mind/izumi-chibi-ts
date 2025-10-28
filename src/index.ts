/**
 * DITS - Dependency Injection TypeScript
 * A TypeScript replica of Scala's distage-core library
 */

// Core
export { Injector } from './core/Injector.js';
export type { InjectorOptions } from './core/Injector.js';
export { Planner } from './core/Planner.js';
export { Producer } from './core/Producer.js';
export type { Locator } from './core/Locator.js';
export { LocatorImpl } from './core/Locator.js';
export {
  Plan,
  PlanningError,
  MissingDependencyError,
  CircularDependencyError,
  ConflictingBindingsError,
} from './core/Plan.js';
export type { PlanStep } from './core/Plan.js';
export { Functoid, getConstructorParameters, getConstructorDependencies } from './core/Functoid.js';
export type { ParameterInfo } from './core/Functoid.js';

// DSL
export { ModuleDef, BindingBuilder, SetBindingBuilder } from './dsl/ModuleDef.js';

// Model
export { DIKey, ID_METADATA_KEY, PARAM_IDS_METADATA_KEY } from './model/DIKey.js';
export { Id, getParameterId, getAllParameterIds } from './model/Id.js';
export { Injectable, Inject } from './model/Injectable.js';
export { Axis, AxisPoint, Activation, BindingTags } from './model/Activation.js';
export { BindingKind, Bindings } from './model/Binding.js';
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
} from './model/Binding.js';

// Re-export reflect-metadata for convenience
import 'reflect-metadata';
