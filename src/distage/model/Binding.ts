import { DIKey } from '@/distage/model/DIKey';
import { BindingTags } from '@/distage/model/Activation';
import { Functoid } from '@/distage/core/Functoid';

/**
 * Base interface for all binding types
 */
export interface Binding<T = any> {
  readonly key: DIKey<T>;
  readonly tags: BindingTags;
  readonly kind: BindingKind;
}

/**
 * Types of bindings supported by distage
 */
export enum BindingKind {
  Instance = 'Instance',
  Class = 'Class',
  Factory = 'Factory',
  Alias = 'Alias',
  Set = 'Set',
  WeakSet = 'WeakSet',
  AssistedFactory = 'AssistedFactory',
}

/**
 * Binding that provides a pre-existing instance
 */
export interface InstanceBinding<T = any> extends Binding<T> {
  kind: BindingKind.Instance;
  instance: T;
}

/**
 * Binding that instantiates a class using its constructor
 */
export interface ClassBinding<T = any> extends Binding<T> {
  kind: BindingKind.Class;
  implementation: new (...args: any[]) => T;
}

/**
 * Binding that uses a factory function (Functoid) to create instances
 */
export interface FactoryBinding<T = any> extends Binding<T> {
  kind: BindingKind.Factory;
  factory: Functoid<T>;
}

/**
 * Binding that creates an alias to another key
 */
export interface AliasBinding<T = any> extends Binding<T> {
  kind: BindingKind.Alias;
  target: DIKey<T>;
}

/**
 * Binding that contributes an element to a set
 */
export interface SetBinding<T = any> extends Binding<Set<T>> {
  kind: BindingKind.Set;
  elementKey: DIKey<T>;
  element: ClassBinding<T> | InstanceBinding<T> | FactoryBinding<T>;
  weak: boolean;
}

/**
 * Binding that contributes a weak element to a set.
 * Weak elements are only included if their dependencies are satisfied.
 */
export interface WeakSetBinding<T = any> extends Binding<Set<T>> {
  kind: BindingKind.WeakSet;
  elementKey: DIKey<T>;
  element: ClassBinding<T> | InstanceBinding<T> | FactoryBinding<T>;
}

/**
 * Binding for assisted injection (factory bindings).
 * These allow creating multiple instances with runtime parameters
 * combined with DI-managed dependencies.
 */
export interface AssistedFactoryBinding<T = any> extends Binding<T> {
  kind: BindingKind.AssistedFactory;
  implementation: new (...args: any[]) => T;
  assistedParams: string[]; // Names of parameters to be provided at runtime
}

/**
 * Union type of all binding types
 */
export type AnyBinding =
  | InstanceBinding
  | ClassBinding
  | FactoryBinding
  | AliasBinding
  | SetBinding
  | WeakSetBinding
  | AssistedFactoryBinding;

/**
 * Helper functions to create bindings
 */
export const Bindings = {
  instance<T>(key: DIKey<T>, instance: T, tags: BindingTags = BindingTags.empty()): InstanceBinding<T> {
    return {
      key,
      tags,
      kind: BindingKind.Instance,
      instance,
    };
  },

  class<T>(
    key: DIKey<T>,
    implementation: new (...args: any[]) => T,
    tags: BindingTags = BindingTags.empty(),
  ): ClassBinding<T> {
    return {
      key,
      tags,
      kind: BindingKind.Class,
      implementation,
    };
  },

  factory<T>(
    key: DIKey<T>,
    factory: Functoid<T>,
    tags: BindingTags = BindingTags.empty(),
  ): FactoryBinding<T> {
    return {
      key,
      tags,
      kind: BindingKind.Factory,
      factory,
    };
  },

  alias<T>(
    key: DIKey<T>,
    target: DIKey<T>,
    tags: BindingTags = BindingTags.empty(),
  ): AliasBinding<T> {
    return {
      key,
      tags,
      kind: BindingKind.Alias,
      target,
    };
  },

  set<T>(
    setKey: DIKey<Set<T>>,
    elementKey: DIKey<T>,
    element: ClassBinding<T> | InstanceBinding<T> | FactoryBinding<T>,
    weak: boolean = false,
    tags: BindingTags = BindingTags.empty(),
  ): SetBinding<T> {
    return {
      key: setKey,
      tags,
      kind: BindingKind.Set,
      elementKey,
      element,
      weak,
    };
  },

  weakSet<T>(
    setKey: DIKey<Set<T>>,
    elementKey: DIKey<T>,
    element: ClassBinding<T> | InstanceBinding<T> | FactoryBinding<T>,
    tags: BindingTags = BindingTags.empty(),
  ): WeakSetBinding<T> {
    return {
      key: setKey,
      tags,
      kind: BindingKind.WeakSet,
      elementKey,
      element,
    };
  },

  assistedFactory<T>(
    key: DIKey<T>,
    implementation: new (...args: any[]) => T,
    assistedParams: string[] = [],
    tags: BindingTags = BindingTags.empty(),
  ): AssistedFactoryBinding<T> {
    return {
      key,
      tags,
      kind: BindingKind.AssistedFactory,
      implementation,
      assistedParams,
    };
  },
};
