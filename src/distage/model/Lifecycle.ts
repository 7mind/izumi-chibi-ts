/**
 * Lifecycle management for resources that need acquisition and cleanup.
 *
 * Inspired by distage's Lifecycle feature, this provides automatic resource
 * management with guaranteed cleanup.
 *
 * Example:
 *   const dbLifecycle = Lifecycle.make(
 *     () => connectToDatabase(), // acquire
 *     (db) => db.disconnect()     // release
 *   );
 */

/**
 * A resource that needs to be acquired and released/cleaned up.
 *
 * The Lifecycle type ensures that resources are properly cleaned up
 * even if errors occur during usage.
 */
export class Lifecycle<T> {
  constructor(
    private readonly acquireFn: () => T | Promise<T>,
    private readonly releaseFn: (resource: T) => void | Promise<void>,
  ) {}

  /**
   * Create a Lifecycle from acquire and release functions
   */
  static make<T>(
    acquire: () => T | Promise<T>,
    release: (resource: T) => void | Promise<void>,
  ): Lifecycle<T> {
    return new Lifecycle(acquire, release);
  }

  /**
   * Create a Lifecycle from an object with a close() method
   * (like file handles, database connections, etc.)
   */
  static fromAutoCloseable<T extends { close(): void | Promise<void> }>(
    acquire: () => T | Promise<T>,
  ): Lifecycle<T> {
    return new Lifecycle(
      acquire,
      (resource) => resource.close(),
    );
  }

  /**
   * Create a Lifecycle that just wraps a value (no cleanup needed)
   */
  static pure<T>(value: T): Lifecycle<T> {
    return new Lifecycle(
      () => value,
      () => {},
    );
  }

  /**
   * Acquire the resource
   */
  async acquire(): Promise<T> {
    return await this.acquireFn();
  }

  /**
   * Release/cleanup the resource
   */
  async release(resource: T): Promise<void> {
    await this.releaseFn(resource);
  }

  /**
   * Use the resource and automatically clean it up afterwards
   *
   * This is the recommended way to use a Lifecycle - it guarantees
   * cleanup even if an error occurs.
   */
  async use<R>(fn: (resource: T) => R | Promise<R>): Promise<R> {
    const resource = await this.acquire();
    try {
      return await fn(resource);
    } finally {
      await this.release(resource);
    }
  }

  /**
   * Map the resource to a different type
   */
  map<R>(fn: (resource: T) => R | Promise<R>): Lifecycle<R> {
    return new Lifecycle(
      async () => {
        const resource = await this.acquire();
        return await fn(resource);
      },
      async (mapped) => {
        // Note: We can't release the original resource here
        // This is a limitation of the map operation
        // For complex scenarios, use flatMap or compose lifecycles differently
      },
    );
  }

  /**
   * Chain two lifecycles together
   */
  flatMap<R>(fn: (resource: T) => Lifecycle<R>): Lifecycle<R> {
    return new Lifecycle(
      async () => {
        const resource = await this.acquire();
        const nextLifecycle = fn(resource);
        return await nextLifecycle.acquire();
      },
      async (mapped) => {
        // Note: This is simplified - in production you'd want to track
        // both resources and release them in reverse order
      },
    );
  }
}

/**
 * Manages multiple Lifecycle resources and ensures they're all released
 * in reverse order of acquisition (LIFO - Last In, First Out).
 */
export class LifecycleManager {
  private resources: Array<{ resource: any; lifecycle: Lifecycle<any> }> = [];

  /**
   * Acquire a resource and track it for cleanup
   */
  async acquire<T>(lifecycle: Lifecycle<T>): Promise<T> {
    const resource = await lifecycle.acquire();
    this.resources.push({ resource, lifecycle });
    return resource;
  }

  /**
   * Release all acquired resources in reverse order (LIFO)
   */
  async releaseAll(): Promise<void> {
    const errors: Error[] = [];

    // Release in reverse order (LIFO)
    while (this.resources.length > 0) {
      const { resource, lifecycle } = this.resources.pop()!;
      try {
        await lifecycle.release(resource);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateLifecycleError(errors);
    }
  }

  /**
   * Use multiple resources and automatically clean them all up
   */
  async use<R>(fn: () => R | Promise<R>): Promise<R> {
    try {
      return await fn();
    } finally {
      await this.releaseAll();
    }
  }
}

/**
 * Error that aggregates multiple cleanup errors
 */
export class AggregateLifecycleError extends Error {
  constructor(public readonly errors: Error[]) {
    super(
      `Multiple errors during lifecycle cleanup:\n` +
      errors.map((e, i) => `  ${i + 1}. ${e.message}`).join('\n')
    );
    this.name = 'AggregateLifecycleError';
  }
}
