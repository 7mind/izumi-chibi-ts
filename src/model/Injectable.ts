import 'reflect-metadata';

/**
 * Decorator to mark a class as injectable.
 *
 * IMPORTANT: TypeScript/SWC only emits parameter type metadata when there's
 * a parameter decorator. You MUST use @Inject() on at least the first parameter
 * for automatic dependency injection to work.
 *
 * Example:
 *   @Injectable()
 *   class MyService {
 *     constructor(@Inject() db: Database) {}
 *   }
 *
 * Alternatively, you can use @Id() which also triggers metadata emission:
 *   @Injectable()
 *   class MyService {
 *     constructor(@Id('primary') db: Database) {}
 *   }
 */
export function Injectable() {
  return function (constructor: any) {
    // Store a marker so we know this class is injectable
    Reflect.defineMetadata('dits:injectable', true, constructor);
    return constructor;
  };
}

/**
 * Parameter decorator that triggers metadata emission.
 * Use this on at least one constructor parameter to enable automatic dependency injection.
 *
 * Example:
 *   class MyService {
 *     constructor(@Inject() db: Database, @Inject() config: Config) {}
 *   }
 */
export function Inject() {
  return function (
    target: Object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) {
    // This decorator doesn't need to do anything - its presence triggers
    // TypeScript/SWC to emit design:paramtypes metadata
  };
}

/**
 * Check if a class has been marked as @Injectable()
 */
export function isInjectable(target: any): boolean {
  return Reflect.getMetadata('dits:injectable', target) === true;
}
