import { DIKey } from '@/distage/model/DIKey';
import { getAllParameterIds } from '@/distage/model/Id';
import { getConstructorTypes } from '@/distage/model/Reflected';

/**
 * Helper type to extract instance types from a tuple of constructor types.
 * Maps [typeof Database, typeof Config] -> [Database, Config]
 */
type InstanceTypes<T extends readonly any[]> = T extends readonly [infer First, ...infer Rest]
  ? [
      First extends abstract new (...args: any[]) => infer R ? R : First,
      ...InstanceTypes<Rest>
    ]
  : [];

/**
 * Represents information about a function parameter
 */
export interface ParameterInfo {
  index: number;
  type: any;
  id?: string;
}

/**
 * A Functoid represents a function with its dependencies.
 * It's the core abstraction in distage for representing dependency constructors.
 *
 * Functoids can be created from:
 * - Regular functions
 * - Class constructors
 * - Other functoids (for composition)
 *
 * They support both automatic dependency resolution via reflect-metadata
 * and manual annotation for cases where reflection is not sufficient.
 */
export class Functoid<T = any> {
  private dependencies: DIKey[] = [];

  constructor(
    private readonly fn: (...args: any[]) => T,
    private readonly context?: any,
  ) {}

  /**
   * Manually set dependencies as DIKeys.
   *
   * Example:
   *   new Functoid((a, b) => new Service(a, b))
   *     .withDependencies([DIKey.of(Database), DIKey.named(Config, 'prod')])
   */
  withDependencies(deps: DIKey[]): this {
    this.dependencies = [...deps];
    return this;
  }

  /**
   * Manually specify parameter types.
   * Required when TypeScript reflection doesn't work (e.g., plain functions).
   *
   * Example:
   *   new Functoid((a, b) => new Service(a, b))
   *     .withTypes([Database, Config])
   */
  withTypes(types: any[]): this {
    // Check if there are pending IDs from @Id decorators
    const pendingIds = (this as any)._pendingIds as Map<number, string> | undefined;

    if (pendingIds && pendingIds.size > 0) {
      // Merge types with IDs
      this.dependencies = types.map((type, index) => {
        const id = pendingIds.get(index);
        return id ? DIKey.named(type, id) : DIKey.of(type);
      });
      delete (this as any)._pendingIds;
    } else {
      this.dependencies = types.map(type => DIKey.of(type));
    }
    return this;
  }

  /**
   * Combined annotation: specify types and IDs together.
   *
   * Example:
   *   new Functoid((a, b) => new Service(a, b))
   *     .withParams([
   *       { type: Database, id: 'primary' },
   *       { type: Config }
   *     ])
   */
  withParams(params: Array<{ type: any; id?: string }>): this {
    this.dependencies = params.map(param =>
      param.id ? DIKey.named(param.type, param.id) : DIKey.of(param.type)
    );
    return this;
  }

  /**
   * Get information about all parameters this functoid depends on
   */
  getParameters(): ParameterInfo[] {
    return this.dependencies.map((key, index) => ({
      index,
      type: key.type,
      id: key.id,
    }));
  }

  /**
   * Get DIKeys for all dependencies
   */
  getDependencies(): DIKey[] {
    // Validate that dependencies are properly set if the function has parameters
    if (this.dependencies.length === 0 && this.fn.length > 0) {
      throw new Error(
        `Cannot resolve dependencies: type information is missing. ` +
        `The function has ${this.fn.length} parameter(s) but no dependency information was provided. ` +
        `Make sure emitDecoratorMetadata is enabled and types are not stripped, or use .withTypes() or .withParams() to specify dependencies manually.`
      );
    }
    return this.dependencies;
  }

  /**
   * Execute the functoid with the given arguments
   */
  execute(args: any[]): T {
    if (this.context) {
      return this.fn.apply(this.context, args);
    }
    return this.fn(...args);
  }

  /**
   * Get the underlying function
   */
  getFunction(): (...args: any[]) => T {
    return this.fn;
  }

  /**
   * Create a Functoid from a constructor.
   *
   * If the constructor is decorated with @Injectable(...types), the types will be
   * automatically detected. Otherwise, you must manually specify types using
   * .withTypes() or .withParams().
   */
  static fromConstructor<T>(ctor: new (...args: any[]) => T): Functoid<T> {
    const functoid = new Functoid((...args: any[]) => new ctor(...args));

    // Get parameter types from @Injectable decorator (if present)
    const types = getConstructorTypes(ctor);

    // Get parameter IDs from @Id decorators (if any)
    // Note: @Id stores metadata on the constructor itself, not the prototype
    const paramIds = getAllParameterIds(ctor, 'constructor');

    if (types && types.length > 0) {
      // Auto-resolve from @Injectable decorator
      if (paramIds.size > 0) {
        // Merge types with IDs
        functoid.dependencies = types.map((type, index) => {
          const id = paramIds.get(index);
          return id ? DIKey.named(type, id) : DIKey.of(type);
        });
      } else {
        functoid.dependencies = types.map(type => DIKey.of(type));
      }
    } else if (paramIds.size > 0) {
      // If there are @Id decorators but no types specified, store IDs for later
      (functoid as any)._pendingIds = paramIds;
      functoid.dependencies = [];
    } else {
      functoid.dependencies = [];
    }

    return functoid;
  }

  /**
   * Create a Functoid from a factory function.
   * Note: Without reflect-metadata, you must manually specify types using .withTypes() or .withParams()
   * if the function has parameters.
   */
  static fromFunction<T>(fn: (...args: any[]) => T): Functoid<T> {
    const functoid = new Functoid(fn);
    functoid.dependencies = [];
    return functoid;
  }

  /**
   * Create a type-safe Functoid from a factory function with explicit parameter types.
   * TypeScript validates at compile-time that the types match the function parameters.
   *
   * Example:
   *   const functoid = Functoid.make(
   *     [Database, Config] as const,
   *     (db: Database, config: Config) => new UserService(db, config)
   *   );
   *
   * Note: Use 'as const' on the types array to get compile-time validation.
   *
   * Compile-time validation:
   *   Functoid.make([Database] as const, (db: Database, cfg: Config) => ...)  // ✗ Error: wrong count
   *   Functoid.make([Config, Database] as const, (db: Database, cfg: Config) => ...)  // ✗ Error: wrong order
   */
  static make<const Args extends readonly (abstract new (...args: any[]) => any)[], R>(
    types: Args,
    fn: (...params: InstanceTypes<Args>) => R
  ): Functoid<R> {
    const functoid = new Functoid(fn as (...args: any[]) => R);
    functoid.dependencies = (types as readonly any[]).map(type => DIKey.of(type));
    return functoid;
  }

  /**
   * Create a Functoid that returns a constant value
   */
  static constant<T>(value: T): Functoid<T> {
    const functoid = new Functoid(() => value);
    functoid.dependencies = []; // Constants have no dependencies
    return functoid;
  }

  /**
   * Map the result of this functoid
   */
  map<R>(mapper: (value: T) => R): Functoid<R> {
    const mapped = new Functoid((...args: any[]) => {
      const result = this.execute(args);
      return mapper(result);
    });
    // Copy dependencies from the original functoid
    mapped.dependencies = [...this.dependencies];
    return mapped;
  }
}
