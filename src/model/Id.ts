import 'reflect-metadata';
import { ID_METADATA_KEY } from '@/model/DIKey';

/**
 * Decorator to mark a parameter or property with a named identifier.
 * Used to distinguish multiple bindings of the same type.
 *
 * Example:
 *   class MyService {
 *     constructor(@Id('primary') db: Database) {}
 *   }
 */
export function Id(id: string) {
  return function (
    target: Object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) {
    // For constructor parameters, propertyKey is undefined
    // For method parameters, propertyKey is the method name
    const key = propertyKey || 'constructor';

    // Store the ID metadata for this parameter
    const existingIds: Map<number, string> =
      Reflect.getOwnMetadata(ID_METADATA_KEY, target, key) || new Map();

    existingIds.set(parameterIndex, id);
    Reflect.defineMetadata(ID_METADATA_KEY, existingIds, target, key);
  };
}

/**
 * Get the @Id annotation for a constructor parameter, if any
 */
export function getParameterId(
  target: any,
  propertyKey: string | symbol,
  parameterIndex: number,
): string | undefined {
  const ids: Map<number, string> | undefined =
    Reflect.getOwnMetadata(ID_METADATA_KEY, target, propertyKey);

  return ids?.get(parameterIndex);
}

/**
 * Get all @Id annotations for a constructor's parameters
 */
export function getAllParameterIds(
  target: any,
  propertyKey: string | symbol = 'constructor',
): Map<number, string> {
  return Reflect.getOwnMetadata(ID_METADATA_KEY, target, propertyKey) || new Map();
}
