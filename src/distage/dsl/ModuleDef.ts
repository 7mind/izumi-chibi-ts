import { DIKey } from '@/distage/model/DIKey';
import { AnyBinding, Bindings } from '@/distage/model/Binding';
import { BindingTags, Axis, AxisPoint } from '@/distage/model/Activation';
import { Functoid } from '@/distage/core/Functoid';

/**
 * Builder for specifying the source of a binding (like izumi-chibi-py's .using())
 */
export class BindingFromBuilder<T> {
  constructor(
    private readonly bindingBuilder: BindingBuilder<T>,
  ) {}

  /**
   * Bind to a specific class type (will be instantiated via constructor injection)
   */
  type(implementation: new (...args: any[]) => T): ModuleDef {
    return this.bindingBuilder.finalize((key, tags) =>
      Bindings.class(key, implementation, tags)
    );
  }

  /**
   * Bind to a specific value instance
   */
  value(instance: T): ModuleDef {
    return this.bindingBuilder.finalize((key, tags) =>
      Bindings.instance(key, instance, tags)
    );
  }

  /**
   * Bind to a factory function or Functoid
   */
  factory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  factory<R extends T>(functoid: Functoid<R>): ModuleDef;
  factory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    return this.bindingBuilder.finalize((key, tags) => {
      const functoid =
        factoryOrFunctoid instanceof Functoid
          ? factoryOrFunctoid
          : Functoid.fromFunction(factoryOrFunctoid);
      return Bindings.factory(key, functoid, tags);
    });
  }

  /**
   * Create an alias to another binding
   */
  alias(targetType: new (...args: any[]) => T, targetId?: string): ModuleDef {
    return this.bindingBuilder.finalize((key, tags) => {
      const targetKey = targetId ? DIKey.named(targetType, targetId) : DIKey.of(targetType);
      return Bindings.alias(key, targetKey, tags);
    });
  }

  /**
   * Create an assisted factory binding (for runtime parameters + DI)
   */
  assistedFactory(assistedParams: string[] = []): ModuleDef {
    return this.bindingBuilder.finalize((key, tags) =>
      Bindings.assistedFactory(key, this.bindingBuilder['type'], assistedParams, tags)
    );
  }
}

/**
 * Builder for creating a single binding with fluent API
 */
export class BindingBuilder<T> {
  private currentId?: string;
  private currentTags: BindingTags = BindingTags.empty();

  constructor(
    private readonly type: new (...args: any[]) => T,
    private readonly module: ModuleDef,
  ) {}

  /**
   * Add a named identifier to this binding
   */
  named(id: string): this {
    this.currentId = id;
    return this;
  }

  /**
   * Tag this binding with an axis point for conditional selection
   */
  tagged(axis: Axis, choice: string): this;
  tagged(point: AxisPoint): this;
  tagged(axisOrPoint: Axis | AxisPoint, choice?: string): this {
    if (axisOrPoint instanceof AxisPoint) {
      this.currentTags = this.currentTags.withTag(axisOrPoint.axis, axisOrPoint.choice);
    } else if (choice !== undefined) {
      this.currentTags = this.currentTags.withTag(axisOrPoint, choice);
    } else {
      throw new Error('Either provide an AxisPoint or both axis and choice');
    }
    return this;
  }

  /**
   * Start specifying where the binding comes from (izumi-chibi-py style)
   */
  from(): BindingFromBuilder<T> {
    return new BindingFromBuilder(this);
  }

  /**
   * Get the DIKey for this binding
   */
  private getKey(): DIKey<T> {
    return this.currentId
      ? DIKey.named(this.type, this.currentId)
      : DIKey.of(this.type);
  }

  /**
   * Internal method to finalize the binding
   * @internal
   */
  finalize(createBinding: (key: DIKey<T>, tags: BindingTags) => AnyBinding): ModuleDef {
    const key = this.getKey();
    const binding = createBinding(key, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  // Legacy methods for backward compatibility (deprecated)
  /** @deprecated Use .from().value() instead */
  fromValue(value: T): ModuleDef {
    return this.from().value(value);
  }

  /** @deprecated Use .from().type() instead */
  fromClass(implementation: new (...args: any[]) => T): ModuleDef {
    return this.from().type(implementation);
  }

  /** @deprecated Use .from().type() with the same type instead */
  fromSelf(): ModuleDef {
    return this.from().type(this.type);
  }

  /** @deprecated Use .from().factory() instead */
  fromFactory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  fromFactory<R extends T>(functoid: Functoid<R>): ModuleDef;
  fromFactory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    return this.from().factory(factoryOrFunctoid as any);
  }

  /** @deprecated Use .from().alias() instead */
  fromAlias(targetType: new (...args: any[]) => T, targetId?: string): ModuleDef {
    return this.from().alias(targetType, targetId);
  }

  /** @deprecated Use .from().assistedFactory() instead */
  fromAssistedFactory(assistedParams: string[] = []): ModuleDef {
    return this.from().assistedFactory(assistedParams);
  }
}

/**
 * Builder for specifying the source of a set element binding
 */
export class SetBindingFromBuilder<T> {
  constructor(
    private readonly setBuilder: SetBindingBuilder<T>,
  ) {}

  /**
   * Add a class type to the set (will be instantiated)
   */
  type(implementation: new (...args: any[]) => T): ModuleDef {
    return this.setBuilder.finalizeElement((setKey, elementKey, tags, weak) => {
      const element = Bindings.class(elementKey, implementation, tags);
      return Bindings.set(setKey, elementKey, element, weak, tags);
    });
  }

  /**
   * Add a value instance to the set
   */
  value(instance: T): ModuleDef {
    return this.setBuilder.finalizeElement((setKey, elementKey, tags, weak) => {
      const element = Bindings.instance(elementKey, instance, tags);
      return Bindings.set(setKey, elementKey, element, weak, tags);
    });
  }

  /**
   * Add a factory to the set
   */
  factory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  factory<R extends T>(functoid: Functoid<R>): ModuleDef;
  factory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    return this.setBuilder.finalizeElement((setKey, elementKey, tags, weak) => {
      const functoid =
        factoryOrFunctoid instanceof Functoid
          ? factoryOrFunctoid
          : Functoid.fromFunction(factoryOrFunctoid);
      const element = Bindings.factory(elementKey, functoid, tags);
      return Bindings.set(setKey, elementKey, element, weak, tags);
    });
  }
}

/**
 * Builder for set bindings
 */
export class SetBindingBuilder<T> {
  private currentId?: string;
  private currentTags: BindingTags = BindingTags.empty();
  private weak: boolean = false;

  constructor(
    private readonly elementType: new (...args: any[]) => T,
    private readonly module: ModuleDef,
  ) {}

  /**
   * Add a named identifier to this set binding
   */
  named(id: string): this {
    this.currentId = id;
    return this;
  }

  /**
   * Tag this set binding
   */
  tagged(axis: Axis, choice: string): this;
  tagged(point: AxisPoint): this;
  tagged(axisOrPoint: Axis | AxisPoint, choice?: string): this {
    if (axisOrPoint instanceof AxisPoint) {
      this.currentTags = this.currentTags.withTag(axisOrPoint.axis, axisOrPoint.choice);
    } else if (choice !== undefined) {
      this.currentTags = this.currentTags.withTag(axisOrPoint, choice);
    } else {
      throw new Error('Either provide an AxisPoint or both axis and choice');
    }
    return this;
  }

  /**
   * Mark this as a weak set binding (only included if dependencies are satisfied)
   */
  makeWeak(): this {
    this.weak = true;
    return this;
  }

  /**
   * Start specifying where the set element comes from
   */
  from(): SetBindingFromBuilder<T> {
    return new SetBindingFromBuilder(this);
  }

  private getSetKey(): DIKey<Set<T>> {
    return this.currentId
      ? DIKey.namedSet(this.elementType, this.currentId)
      : DIKey.set(this.elementType);
  }

  private getElementKey(): DIKey<T> {
    return this.currentId
      ? DIKey.named(this.elementType, this.currentId)
      : DIKey.of(this.elementType);
  }

  /**
   * Internal method to finalize a set element binding
   * @internal
   */
  finalizeElement(
    createBinding: (
      setKey: DIKey<Set<T>>,
      elementKey: DIKey<T>,
      tags: BindingTags,
      weak: boolean,
    ) => AnyBinding
  ): ModuleDef {
    const setKey = this.getSetKey();
    const elementKey = this.getElementKey();
    const binding = createBinding(setKey, elementKey, this.currentTags, this.weak);
    this.module.addBinding(binding);
    return this.module;
  }

  // Legacy methods for backward compatibility (deprecated)
  /** @deprecated Use .from().value() instead */
  addValue(value: T): ModuleDef {
    return this.from().value(value);
  }

  /** @deprecated Use .from().type() instead */
  addClass(implementation: new (...args: any[]) => T): ModuleDef {
    return this.from().type(implementation);
  }

  /** @deprecated Use .from().type() with element type instead */
  addSelf(): ModuleDef {
    return this.from().type(this.elementType);
  }

  /** @deprecated Use .from().factory() instead */
  addFactory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  addFactory<R extends T>(functoid: Functoid<R>): ModuleDef;
  addFactory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    return this.from().factory(factoryOrFunctoid as any);
  }
}

/**
 * Main DSL for defining dependency injection modules.
 * Provides a fluent API for declaring bindings, inspired by izumi-chibi-py.
 *
 * Example (new syntax):
 *   const module = new ModuleDef()
 *     .make(Database).from().type(PostgresDatabase)
 *     .make(UserService).from().type(UserService)
 *     .make(Config).named('db').from().value(dbConfig)
 *     .many(Plugin).from().type(AuthPlugin)
 *     .many(Plugin).from().type(LoggingPlugin);
 *
 * The .from() method returns a builder that supports:
 *   - .type(Class) - bind to a class (constructor injection)
 *   - .value(instance) - bind to a specific instance
 *   - .factory(fn) - bind to a factory function
 *   - .alias(TargetClass) - create an alias to another binding
 *
 * Legacy syntax (deprecated but still supported):
 *   .make(Database).fromClass(PostgresDatabase)
 *   .make(UserService).fromSelf()
 *   .make(Config).fromValue(config)
 */
export class ModuleDef {
  private bindings: AnyBinding[] = [];

  /**
   * Start defining a binding for a type
   */
  make<T>(type: new (...args: any[]) => T): BindingBuilder<T> {
    return new BindingBuilder(type, this);
  }

  /**
   * Start defining a set binding
   */
  many<T>(elementType: new (...args: any[]) => T): SetBindingBuilder<T> {
    return new SetBindingBuilder(elementType, this);
  }

  /**
   * Add a binding directly (internal use)
   */
  addBinding(binding: AnyBinding): void {
    this.bindings.push(binding);
  }

  /**
   * Get all bindings defined in this module
   */
  getBindings(): readonly AnyBinding[] {
    return this.bindings;
  }

  /**
   * Merge this module with another, combining bindings
   */
  append(other: ModuleDef): ModuleDef {
    const merged = new ModuleDef();
    merged.bindings = [...this.bindings, ...other.bindings];
    return merged;
  }

  /**
   * Override bindings in this module with those from another module.
   * Later bindings take precedence.
   */
  overriddenBy(other: ModuleDef): ModuleDef {
    const merged = new ModuleDef();

    // Group bindings by key
    const bindingMap = new Map<string, AnyBinding[]>();

    for (const binding of this.bindings) {
      const key = binding.key.toMapKey();
      if (!bindingMap.has(key)) {
        bindingMap.set(key, []);
      }
      bindingMap.get(key)!.push(binding);
    }

    for (const binding of other.bindings) {
      const key = binding.key.toMapKey();
      if (!bindingMap.has(key)) {
        bindingMap.set(key, []);
      }
      bindingMap.get(key)!.push(binding);
    }

    // For each key, use the last binding
    for (const bindings of bindingMap.values()) {
      merged.bindings.push(bindings[bindings.length - 1]);
    }

    return merged;
  }

  /**
   * Get the number of bindings in this module
   */
  size(): number {
    return this.bindings.length;
  }
}
