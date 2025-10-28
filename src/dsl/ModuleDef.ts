import { DIKey } from '../model/DIKey.js';
import { AnyBinding, Bindings } from '../model/Binding.js';
import { BindingTags, Axis, AxisPoint } from '../model/Activation.js';
import { Functoid } from '../core/Functoid.js';

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
   * Get the DIKey for this binding
   */
  private getKey(): DIKey<T> {
    return this.currentId
      ? DIKey.named(this.type, this.currentId)
      : DIKey.of(this.type);
  }

  /**
   * Bind to a specific value instance
   */
  fromValue(value: T): ModuleDef {
    const key = this.getKey();
    const binding = Bindings.instance(key, value, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Bind to a class implementation (will be instantiated)
   */
  fromClass(implementation: new (...args: any[]) => T): ModuleDef {
    const key = this.getKey();
    const binding = Bindings.class(key, implementation, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Bind using the type itself as implementation (auto-binding)
   */
  fromSelf(): ModuleDef {
    return this.fromClass(this.type);
  }

  /**
   * Bind to a factory function
   */
  fromFactory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  fromFactory<R extends T>(functoid: Functoid<R>): ModuleDef;
  fromFactory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    const key = this.getKey();
    const functoid =
      factoryOrFunctoid instanceof Functoid
        ? factoryOrFunctoid
        : Functoid.fromFunction(factoryOrFunctoid);

    const binding = Bindings.factory(key, functoid, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Create an alias to another binding
   */
  fromAlias(targetType: new (...args: any[]) => T, targetId?: string): ModuleDef {
    const key = this.getKey();
    const targetKey = targetId ? DIKey.named(targetType, targetId) : DIKey.of(targetType);
    const binding = Bindings.alias(key, targetKey, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Create an assisted factory binding (for runtime parameters + DI)
   */
  fromAssistedFactory(assistedParams: string[] = []): ModuleDef {
    const key = this.getKey();
    const binding = Bindings.assistedFactory(key, this.type, assistedParams, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
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
   * Add a value to the set
   */
  addValue(value: T): ModuleDef {
    const setKey = this.getSetKey();
    const elementKey = this.getElementKey();
    const element = Bindings.instance(elementKey, value, this.currentTags);
    const binding = Bindings.set(setKey, elementKey, element, this.weak, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Add a class implementation to the set
   */
  addClass(implementation: new (...args: any[]) => T): ModuleDef {
    const setKey = this.getSetKey();
    const elementKey = this.getElementKey();
    const element = Bindings.class(elementKey, implementation, this.currentTags);
    const binding = Bindings.set(setKey, elementKey, element, this.weak, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
  }

  /**
   * Add using the element type itself
   */
  addSelf(): ModuleDef {
    return this.addClass(this.elementType);
  }

  /**
   * Add a factory to the set
   */
  addFactory<R extends T>(factory: (...args: any[]) => R): ModuleDef;
  addFactory<R extends T>(functoid: Functoid<R>): ModuleDef;
  addFactory<R extends T>(factoryOrFunctoid: ((...args: any[]) => R) | Functoid<R>): ModuleDef {
    const setKey = this.getSetKey();
    const elementKey = this.getElementKey();
    const functoid =
      factoryOrFunctoid instanceof Functoid
        ? factoryOrFunctoid
        : Functoid.fromFunction(factoryOrFunctoid);

    const element = Bindings.factory(elementKey, functoid, this.currentTags);
    const binding = Bindings.set(setKey, elementKey, element, this.weak, this.currentTags);
    this.module.addBinding(binding);
    return this.module;
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
}

/**
 * Main DSL for defining dependency injection modules.
 * Provides a fluent API for declaring bindings.
 *
 * Example:
 *   const module = new ModuleDef()
 *     .make(Database).fromClass(PostgresDatabase)
 *     .make(UserService).fromSelf()
 *     .make(Config).named('db').fromValue(dbConfig)
 *     .many(Plugin).addClass(AuthPlugin)
 *     .many(Plugin).addClass(LoggingPlugin);
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
