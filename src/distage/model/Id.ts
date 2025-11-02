import { ID_METADATA_KEY } from '@/distage/model/DIKey';

// Symbol to store parameter IDs directly on the target object
const PARAMETER_IDS_SYMBOL = Symbol('distage:parameterIds');

/**
 * Decorator to mark a parameter or property with a named identifier.
 * Used to distinguish multiple bindings of the same type.
 *
 * Example:
 *   class MyService {
 *     constructor(@Id('primary') db: Database) {}
 *   }
 *
 * Can also accept symbols to identify interface tokens:
 *   const ILogger = Symbol('ILogger');
 *   class MyService {
 *     constructor(@Id(ILogger) logger: ILogger) {}
 *   }
 */
export function Id(id: string | symbol) {
  return function (
    target: Object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) {
    // For constructor parameters: target is the constructor, propertyKey is undefined
    // For method parameters: target is the prototype, propertyKey is the method name
    const key = propertyKey || 'constructor';

    // Get or create the storage directly on the target (constructor for constructor params)
    let targetStorage = (target as any)[PARAMETER_IDS_SYMBOL];
    if (!targetStorage) {
      targetStorage = new Map<string | symbol, Map<number, string | symbol>>();
      // Store it as a non-enumerable property
      Object.defineProperty(target, PARAMETER_IDS_SYMBOL, {
        value: targetStorage,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }

    // Get or create the Map for this specific property/constructor
    let propertyIds = targetStorage.get(key);
    if (!propertyIds) {
      propertyIds = new Map<number, string | symbol>();
      targetStorage.set(key, propertyIds);
    }

    // Store the ID for this parameter index
    propertyIds.set(parameterIndex, id);
  };
}

/**
 * Get the @Id annotation for a constructor parameter, if any
 */
export function getParameterId(
  target: any,
  propertyKey: string | symbol,
  parameterIndex: number,
): string | symbol | undefined {
  const targetStorage = target[PARAMETER_IDS_SYMBOL];
  if (!targetStorage) return undefined;

  const propertyIds = targetStorage.get(propertyKey);
  return propertyIds?.get(parameterIndex);
}

/**
 * Get all @Id annotations for a constructor's parameters
 */
export function getAllParameterIds(
  target: any,
  propertyKey: string | symbol = 'constructor',
): Map<number, string | symbol> {
  const targetStorage = target[PARAMETER_IDS_SYMBOL];
  if (!targetStorage) return new Map();

  return targetStorage.get(propertyKey) || new Map();
}
