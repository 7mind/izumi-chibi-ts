/**
 * Subcontext support for nested/child injectors.
 *
 * Inspired by distage's Subcontext feature, this allows creating nested
 * dependency injection contexts with their own scope and local dependencies.
 *
 * Subcontexts are useful for:
 * - Request-scoped dependencies in web applications
 * - Test scopes
 * - Transaction scopes
 * - Any scenario where you need a temporary sub-graph of dependencies
 *
 * Example:
 *   const injector = new Injector();
 *   const parentLocator = injector.produce(module, roots);
 *
 *   // Create a subcontext with additional local bindings
 *   const subcontext = parentLocator.createSubcontext(
 *     new ModuleDef().make(RequestId).from().value(requestId)
 *   );
 *
 *   // Use the subcontext
 *   const handler = subcontext.get(DIKey.of(RequestHandler));
 */

import { Locator, LocatorImpl } from './Locator.js';
import { Injector, InjectorOptions } from './Injector.js';
import { ModuleDef } from '../dsl/ModuleDef.js';
import { DIKey } from '../model/DIKey.js';
import { Activation } from '../model/Activation.js';

/**
 * A subcontext is a child locator that inherits from a parent locator
 * and can have additional local bindings.
 *
 * Subcontexts allow you to:
 * 1. Inherit all bindings from the parent locator
 * 2. Add new bindings that are only available in the subcontext
 * 3. Override parent bindings with subcontext-specific implementations
 * 4. Have their own lifecycle management
 */
export class Subcontext implements Locator {
  private readonly childInjector: Injector;
  private readonly childLocator: Locator;

  constructor(
    private readonly parent: Locator,
    childModule: ModuleDef,
    roots: DIKey[],
    options?: InjectorOptions,
  ) {
    // Create a child injector with the new bindings
    // Pass the parent locator so it can resolve dependencies from parent
    this.childInjector = new Injector();
    this.childLocator = this.childInjector.produce(childModule, roots, {
      ...options,
      parentLocator: parent,
    });
  }

  /**
   * Get an instance by key, checking child first, then parent
   */
  get<T>(key: DIKey<T>): T {
    // Try child first
    const childValue = this.childLocator.find(key);
    if (childValue !== undefined) {
      return childValue;
    }

    // Fall back to parent
    return this.parent.get(key);
  }

  /**
   * Get an instance by type
   */
  getByType<T>(type: new (...args: any[]) => T): T {
    return this.get(DIKey.of(type));
  }

  /**
   * Get an instance by type and ID
   */
  getByTypeAndId<T>(type: new (...args: any[]) => T, id: string): T {
    return this.get(DIKey.named(type, id));
  }

  /**
   * Try to get an instance, returning undefined if not found
   */
  find<T>(key: DIKey<T>): T | undefined {
    const childValue = this.childLocator.find(key);
    if (childValue !== undefined) {
      return childValue;
    }
    return this.parent.find(key);
  }

  /**
   * Check if the locator (child or parent) contains an instance for the given key
   */
  has(key: DIKey): boolean {
    return this.childLocator.has(key) || this.parent.has(key);
  }

  /**
   * Get all instances of a set
   */
  getSet<T>(type: new (...args: any[]) => T): Set<T> {
    // Merge sets from parent and child
    const parentSet = this.parent.find(DIKey.set(type));
    const childSet = this.childLocator.find(DIKey.set(type));

    if (parentSet && childSet) {
      // Merge both sets
      return new Set([...parentSet, ...childSet]);
    } else if (childSet) {
      return childSet;
    } else if (parentSet) {
      return parentSet;
    }

    throw new Error(`No set found for type: ${type.name}`);
  }

  /**
   * Get all instances of a named set
   */
  getNamedSet<T>(type: new (...args: any[]) => T, id: string): Set<T> {
    const parentSet = this.parent.find(DIKey.namedSet(type, id));
    const childSet = this.childLocator.find(DIKey.namedSet(type, id));

    if (parentSet && childSet) {
      return new Set([...parentSet, ...childSet]);
    } else if (childSet) {
      return childSet;
    } else if (parentSet) {
      return parentSet;
    }

    throw new Error(`No named set found for type: ${type.name} and id: ${id}`);
  }

  /**
   * Get all keys in the subcontext (both child and parent)
   */
  *keys(): IterableIterator<DIKey> {
    const seen = new Set<string>();

    // Yield child keys first
    for (const key of this.childLocator.keys()) {
      seen.add(key.toMapKey());
      yield key;
    }

    // Then yield parent keys (skipping duplicates)
    for (const key of this.parent.keys()) {
      if (!seen.has(key.toMapKey())) {
        yield key;
      }
    }
  }

  /**
   * Close the subcontext and release its resources
   * Note: This does NOT close the parent locator
   */
  async close(): Promise<void> {
    await this.childLocator.close();
  }

  /**
   * Create a nested subcontext (subcontext of a subcontext)
   */
  createSubcontext(
    module: ModuleDef,
    roots: DIKey[],
    options?: InjectorOptions,
  ): Subcontext {
    return new Subcontext(this, module, roots, options);
  }
}

/**
 * Helper to add subcontext creation to the standard Locator
 */
export function createSubcontext(
  parent: Locator,
  module: ModuleDef,
  roots: DIKey[],
  options?: InjectorOptions,
): Subcontext {
  return new Subcontext(parent, module, roots, options);
}
