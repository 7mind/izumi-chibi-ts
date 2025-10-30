import 'reflect-metadata';
import { DIKey } from '@/distage/model/DIKey';
import { getAllParameterIds } from '@/distage/model/Id';

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
  private parameterAnnotations: Map<number, string | null> = new Map();
  private parameterTypes: Map<number, any> = new Map();

  constructor(
    private readonly fn: (...args: any[]) => T,
    private readonly context?: any,
  ) {}

  /**
   * Manually annotate parameter IDs.
   * Use null to indicate a parameter has no ID annotation.
   * Use undefined to skip annotation (keep existing or auto-detected).
   *
   * Example:
   *   new Functoid((a: string, b: number) => a + b)
   *     .annotate(['myString', null]) // 'a' gets ID 'myString', 'b' has no ID
   */
  annotate(ids: (string | null | undefined)[]): this {
    ids.forEach((id, index) => {
      if (id !== undefined) {
        this.parameterAnnotations.set(index, id);
      }
    });
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
    types.forEach((type, index) => {
      this.parameterTypes.set(index, type);
    });
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
    params.forEach((param, index) => {
      this.parameterTypes.set(index, param.type);
      if (param.id !== undefined) {
        this.parameterAnnotations.set(index, param.id);
      }
    });
    return this;
  }

  /**
   * Get information about all parameters this functoid depends on
   */
  getParameters(): ParameterInfo[] {
    const paramTypes = this.getParameterTypes();
    const paramIds = this.getParameterIds();

    return paramTypes.map((type, index) => ({
      index,
      type,
      id: paramIds.get(index),
    }));
  }

  /**
   * Get DIKeys for all dependencies
   */
  getDependencies(): DIKey[] {
    return this.getParameters().map(param => {
      if (!param.type) {
        throw new Error(
          `Cannot resolve dependency at parameter ${param.index}: type information is missing. ` +
          `Make sure emitDecoratorMetadata is enabled and types are not stripped, or use .annotate() to specify dependencies manually.`
        );
      }

      if (param.id) {
        return DIKey.named(param.type, param.id);
      }
      return DIKey.of(param.type);
    });
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
   * Create a Functoid from a constructor
   */
  static fromConstructor<T>(ctor: new (...args: any[]) => T): Functoid<T> {
    const functoid = new Functoid((...args: any[]) => new ctor(...args));

    // Get parameter types from metadata
    const paramTypes = Reflect.getMetadata('design:paramtypes', ctor) || [];
    if (paramTypes.length > 0) {
      paramTypes.forEach((type: any, index: number) => {
        functoid.parameterTypes.set(index, type);
      });
    }

    // Copy parameter IDs from constructor decorators
    const paramIds = getAllParameterIds(ctor.prototype, 'constructor');
    if (paramIds.size > 0) {
      const annotations: (string | null)[] = [];

      for (let i = 0; i < paramTypes.length; i++) {
        if (paramIds.has(i)) {
          annotations[i] = paramIds.get(i)!;
        }
      }

      if (annotations.length > 0) {
        functoid.annotate(annotations);
      }
    }

    return functoid;
  }

  /**
   * Create a Functoid from a factory function
   */
  static fromFunction<T>(fn: (...args: any[]) => T): Functoid<T> {
    return new Functoid(fn);
  }

  /**
   * Create a Functoid that returns a constant value
   */
  static constant<T>(value: T): Functoid<T> {
    return new Functoid(() => value);
  }

  /**
   * Map the result of this functoid
   */
  map<R>(mapper: (value: T) => R): Functoid<R> {
    return new Functoid((...args: any[]) => {
      const result = this.execute(args);
      return mapper(result);
    });
  }

  /**
   * Get parameter types from reflect-metadata or manual annotations
   */
  private getParameterTypes(): any[] {
    // First, check if types were manually specified
    if (this.parameterTypes.size > 0) {
      const maxIndex = Math.max(...Array.from(this.parameterTypes.keys()));
      const types: any[] = [];
      for (let i = 0; i <= maxIndex; i++) {
        types[i] = this.parameterTypes.get(i);
      }
      return types;
    }

    // Try to get types from reflection
    const reflectedTypes = Reflect.getMetadata('design:paramtypes', this.fn);
    if (reflectedTypes) {
      return reflectedTypes;
    }

    // If no metadata, try to infer from function.length
    // This won't give us type information, but at least we know the arity
    return Array(this.fn.length).fill(undefined);
  }

  /**
   * Get parameter IDs from annotations and decorators
   */
  private getParameterIds(): Map<number, string> {
    const ids = new Map<number, string>();

    // First, add manual annotations
    for (const [index, id] of this.parameterAnnotations) {
      if (id !== null) {
        ids.set(index, id);
      }
    }

    // Then, try to get IDs from decorators if we have a constructor
    // This is already handled in fromConstructor, but we keep this for completeness

    return ids;
  }
}

/**
 * Helper to extract constructor parameters for a class
 */
export function getConstructorParameters<T>(
  ctor: new (...args: any[]) => T,
): ParameterInfo[] {
  const functoid = Functoid.fromConstructor(ctor);
  return functoid.getParameters();
}

/**
 * Helper to extract constructor dependencies as DIKeys
 */
export function getConstructorDependencies<T>(
  ctor: new (...args: any[]) => T,
): DIKey[] {
  const functoid = Functoid.fromConstructor(ctor);
  return functoid.getDependencies();
}
