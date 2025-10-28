import 'reflect-metadata';

/**
 * Decorator to mark a class as injectable.
 *
 * With SWC or Babel (configured with decorator metadata support), this is all you need!
 * The transformer will emit parameter type metadata automatically.
 *
 * Example:
 *   @Injectable()
 *   class MyService {
 *     constructor(db: Database, config: Config) {}
 *   }
 *
 * For named dependencies, use @Id:
 *   @Injectable()
 *   class MyService {
 *     constructor(@Id('primary') db: Database) {}
 *   }
 *
 * Note: Vanilla TypeScript's tsc requires parameter decorators to emit metadata.
 * If you're not using SWC/Babel, you'll need to add at least one parameter decorator
 * (like @Id) to trigger metadata emission.
 */
export function Injectable() {
  return function (constructor: any) {
    // Store a marker so we know this class is injectable
    Reflect.defineMetadata('dits:injectable', true, constructor);
    return constructor;
  };
}

/**
 * Check if a class has been marked as @Injectable()
 */
export function isInjectable(target: any): boolean {
  return Reflect.getMetadata('dits:injectable', target) === true;
}
