// Symbol to store constructor parameter types directly on the class
const CONSTRUCTOR_TYPES_SYMBOL = Symbol('distage:constructorTypes');

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
 * Type-safe decorator to mark a class as injectable and store its constructor parameter types.
 * This allows automatic dependency resolution without needing to call .withDeps().
 *
 * TypeScript validates at compile-time that:
 * - The number of types matches the constructor parameter count
 * - The types are in the correct order
 * - The types match the constructor parameter types
 *
 * Example:
 *   @Injectable(Database, Config)
 *   class MyService {
 *     constructor(db: Database, config: Config) {}
 *   }
 *
 *   // No need for .withDeps() - types are auto-detected from @Injectable:
 *   module.make(MyService).from().type(MyService)
 *
 * For named dependencies, combine with @Id:
 *   @Injectable(Database, Config)
 *   class MyService {
 *     constructor(@Id('primary') db: Database, config: Config) {}
 *   }
 *
 * Compile-time validation:
 *   @Injectable(Database)  // ✗ Compile error: Expected 2 types, got 1
 *   class MyService {
 *     constructor(db: Database, config: Config) {}
 *   }
 *
 *   @Injectable(Config, Database)  // ✗ Compile error: Order is wrong
 *   class MyService {
 *     constructor(db: Database, config: Config) {}
 *   }
 *
 * Runtime validation also occurs as a safety check.
 */
export function Reflected<Args extends readonly (abstract new (...args: any[]) => any)[]>(
  ...types: Args
) {
  return function <
    Params extends any[],
    C extends new (...params: Params) => any
  >(
    constructor: InstanceTypes<Args> extends Params ? C : never
  ): C {
    // Validate parameter count at runtime as a safety check
    const expectedLength = constructor.length;
    if (types.length !== expectedLength) {
      throw new Error(
        `@Injectable: Parameter count mismatch for ${constructor.name}. ` +
        `Expected ${expectedLength} types, got ${types.length}.`
      )
    }

    // Store the parameter types directly on the constructor
    Object.defineProperty(constructor, CONSTRUCTOR_TYPES_SYMBOL, {
      value: types,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    return constructor;
  };
}

/**
 * Get the constructor parameter types stored by @Reflected() or @ApplyReflection()
 */
export function getConstructorTypes(target: any): any[] | undefined {
  return target[CONSTRUCTOR_TYPES_SYMBOL];
}

/**
 * Function to add reflection metadata to third-party classes.
 * Use this when you cannot modify the original class (e.g., from a library).
 *
 * Example:
 *   // Third-party class you can't modify
 *   class ThirdPartyService {
 *     constructor(db: Database, config: Config) {}
 *   }
 *
 *   // Add metadata via companion function
 *   ApplyReflection(ThirdPartyService, Database, Config);
 *
 *   // Now you can use it without .withDeps()
 *   module.make(ThirdPartyService).from().type(ThirdPartyService)
 *
 * The function stores metadata on the class constructor, making it available
 * for dependency injection just like @Reflected.
 */
export function ApplyReflection<
  C extends new (...args: any[]) => any,
  Args extends readonly (abstract new (...args: any[]) => any)[]
>(
  targetClass: C,
  ...types: Args
): void {
  // Validate parameter count at runtime as a safety check
  const expectedLength = targetClass.length;
  if (types.length !== expectedLength) {
    throw new Error(
      `ApplyReflection: Parameter count mismatch for ${targetClass.name}. ` +
      `Expected ${expectedLength} types, got ${types.length}.`
    )
  }

  // Store the parameter types on the target class
  Object.defineProperty(targetClass, CONSTRUCTOR_TYPES_SYMBOL, {
    value: types,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}
