import { DIKey, Callable } from '@/distage/model/DIKey';
import { Lifecycle, LifecycleManager } from '@/distage/model/Lifecycle';

/**
 * Locator provides access to instances in the dependency injection container.
 * It's the result of executing a plan.
 */
export interface Locator {
  /**
   * Get an instance by its DIKey
   * @throws Error if the key is not found
   */
  get<T>(key: DIKey<T>): T;

  /**
   * Get an instance by type
   * @throws Error if the type is not found
   */
  getByType<T>(type: Callable<T>): T;

  /**
   * Get an instance by type and ID
   * @throws Error if the key is not found
   */
  getByTypeAndId<T>(type: Callable<T>, id: string): T;

  /**
   * Try to get an instance, returning undefined if not found
   */
  find<T>(key: DIKey<T>): T | undefined;

  /**
   * Check if the locator contains an instance for the given key
   */
  has(key: DIKey): boolean;

  /**
   * Get all instances of a set
   */
  getSet<T>(type: Callable<T>): Set<T>;

  /**
   * Get all instances of a named set
   */
  getNamedSet<T>(type: Callable<T>, id: string): Set<T>;

  /**
   * Get all keys in the locator
   */
  keys(): IterableIterator<DIKey>;

  /**
   * Release all resources managed by this locator (for lifecycle-aware locators)
   * This is a no-op for basic locators without lifecycle management.
   */
  close(): Promise<void>;
}

/**
 * Implementation of Locator
 */
export class LocatorImpl implements Locator {
  constructor(
    private readonly instances: Map<string, any>,
    private readonly lifecycleManager?: LifecycleManager,
  ) {}

  get<T>(key: DIKey<T>): T {
    const keyStr = key.toMapKey();
    const instance = this.instances.get(keyStr);

    if (instance === undefined) {
      throw new Error(`No instance found for key: ${key.toString()}`);
    }

    return instance;
  }

  getByType<T>(type: Callable<T>): T {
    return this.get(DIKey.of(type));
  }

  getByTypeAndId<T>(type: Callable<T>, id: string): T {
    return this.get(DIKey.named(type, id));
  }

  find<T>(key: DIKey<T>): T | undefined {
    const keyStr = key.toMapKey();
    return this.instances.get(keyStr);
  }

  has(key: DIKey): boolean {
    const keyStr = key.toMapKey();
    return this.instances.has(keyStr);
  }

  getSet<T>(type: Callable<T>): Set<T> {
    return this.get(DIKey.set(type));
  }

  getNamedSet<T>(type: Callable<T>, id: string): Set<T> {
    return this.get(DIKey.namedSet(type, id));
  }

  *keys(): IterableIterator<DIKey> {
    for (const [keyStr, _] of this.instances) {
      // Note: We lose some type information here when reconstructing DIKeys
      // This is a limitation of the string-based map key approach
      // In a production system, you might want to store DIKey objects directly
      yield this.reconstructKey(keyStr);
    }
  }

  /**
   * Release all lifecycle-managed resources.
   * Resources are released in reverse order of acquisition (LIFO).
   */
  async close(): Promise<void> {
    if (this.lifecycleManager) {
      await this.lifecycleManager.releaseAll();
    }
  }

  /**
   * Reconstruct a DIKey from its string representation
   * This is a simplified version and may not work for all cases
   */
  private reconstructKey(keyStr: string): DIKey {
    // This is a simplified implementation
    // In production, you'd want to store the actual DIKey objects
    const [typeName, id, isSetStr] = keyStr.split('|');
    const isSet = isSetStr === 'true';

    // We can't fully reconstruct the type constructor from just the name
    // So this is mainly useful for debugging/iteration
    // For actual use, clients should use the DIKey they already have
    return { toString: () => keyStr } as any;
  }
}
