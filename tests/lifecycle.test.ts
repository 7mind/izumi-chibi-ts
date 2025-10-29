import { describe, it, expect, beforeEach } from 'vitest';
import { Lifecycle, LifecycleManager, AggregateLifecycleError } from '../src/index.js';

describe('Lifecycle', () => {
  describe('Basic Lifecycle Operations', () => {
    it('should acquire and release a resource', async () => {
      const acquired: string[] = [];
      const released: string[] = [];

      const lifecycle = Lifecycle.make(
        () => {
          acquired.push('resource');
          return 'my-resource';
        },
        (resource) => {
          released.push(resource);
        }
      );

      const resource = await lifecycle.acquire();
      expect(resource).toBe('my-resource');
      expect(acquired).toEqual(['resource']);
      expect(released).toEqual([]);

      await lifecycle.release(resource);
      expect(released).toEqual(['my-resource']);
    });

    it('should use resource and automatically clean up', async () => {
      const log: string[] = [];

      const lifecycle = Lifecycle.make(
        () => {
          log.push('acquire');
          return 'resource';
        },
        () => {
          log.push('release');
        }
      );

      const result = await lifecycle.use((resource) => {
        log.push(`use: ${resource}`);
        return 'result';
      });

      expect(result).toBe('result');
      expect(log).toEqual(['acquire', 'use: resource', 'release']);
    });

    it('should release resource even when use throws error', async () => {
      const log: string[] = [];

      const lifecycle = Lifecycle.make(
        () => {
          log.push('acquire');
          return 'resource';
        },
        () => {
          log.push('release');
        }
      );

      await expect(
        lifecycle.use(() => {
          log.push('throw');
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(log).toEqual(['acquire', 'throw', 'release']);
    });
  });

  describe('Lifecycle.fromAutoCloseable', () => {
    class MockConnection {
      public closed = false;

      async close() {
        this.closed = true;
      }

      query() {
        if (this.closed) {
          throw new Error('Connection is closed');
        }
        return 'query result';
      }
    }

    it('should create lifecycle from auto-closeable', async () => {
      const lifecycle = Lifecycle.fromAutoCloseable(
        () => new MockConnection()
      );

      await lifecycle.use((conn) => {
        expect(conn.query()).toBe('query result');
        expect(conn.closed).toBe(false);
      });

      // After use(), connection should be closed
      // We can't directly check the connection here since it's out of scope,
      // so we'll verify in a different way
    });

    it('should close auto-closeable even on error', async () => {
      let connection: MockConnection | null = null;

      const lifecycle = Lifecycle.fromAutoCloseable(() => {
        connection = new MockConnection();
        return connection;
      });

      await expect(
        lifecycle.use(() => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(connection!.closed).toBe(true);
    });
  });

  describe('Lifecycle.pure', () => {
    it('should create a lifecycle with no cleanup', async () => {
      const log: string[] = [];

      const lifecycle = Lifecycle.pure('value');

      const result = await lifecycle.use((value) => {
        log.push(`use: ${value}`);
        return 'result';
      });

      expect(result).toBe('result');
      expect(log).toEqual(['use: value']);
      // No cleanup should happen, so log should only have one entry
    });
  });

  describe('Async acquire and release', () => {
    it('should handle async acquire', async () => {
      const lifecycle = Lifecycle.make(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'async-resource';
        },
        () => {}
      );

      const resource = await lifecycle.acquire();
      expect(resource).toBe('async-resource');
    });

    it('should handle async release', async () => {
      const released: string[] = [];

      const lifecycle = Lifecycle.make(
        () => 'resource',
        async (resource) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          released.push(resource);
        }
      );

      await lifecycle.use((resource) => resource);
      expect(released).toEqual(['resource']);
    });
  });

  describe('Real-world example: Database Connection', () => {
    class DatabaseConnection {
      constructor(
        public readonly connectionString: string,
        public connected = false,
      ) {}

      async connect() {
        this.connected = true;
      }

      async disconnect() {
        this.connected = false;
      }

      query(sql: string): string {
        if (!this.connected) {
          throw new Error('Not connected');
        }
        return `Result: ${sql}`;
      }
    }

    it('should manage database connection lifecycle', async () => {
      const dbLifecycle = Lifecycle.make(
        async () => {
          const conn = new DatabaseConnection('localhost:5432');
          await conn.connect();
          return conn;
        },
        async (conn) => {
          await conn.disconnect();
        }
      );

      const results = await dbLifecycle.use((db) => {
        return [
          db.query('SELECT * FROM users'),
          db.query('SELECT * FROM posts'),
        ];
      });

      expect(results).toEqual([
        'Result: SELECT * FROM users',
        'Result: SELECT * FROM posts',
      ]);
    });
  });
});

describe('LifecycleManager', () => {
  it('should acquire and release multiple resources', async () => {
    const log: string[] = [];

    const manager = new LifecycleManager();

    const lifecycle1 = Lifecycle.make(
      () => {
        log.push('acquire-1');
        return 'resource-1';
      },
      () => {
        log.push('release-1');
      }
    );

    const lifecycle2 = Lifecycle.make(
      () => {
        log.push('acquire-2');
        return 'resource-2';
      },
      () => {
        log.push('release-2');
      }
    );

    const resource1 = await manager.acquire(lifecycle1);
    const resource2 = await manager.acquire(lifecycle2);

    expect(resource1).toBe('resource-1');
    expect(resource2).toBe('resource-2');
    expect(log).toEqual(['acquire-1', 'acquire-2']);

    await manager.releaseAll();

    // Should release in reverse order (LIFO)
    expect(log).toEqual(['acquire-1', 'acquire-2', 'release-2', 'release-1']);
  });

  it('should release resources in LIFO order', async () => {
    const releaseOrder: number[] = [];

    const manager = new LifecycleManager();

    for (let i = 1; i <= 3; i++) {
      await manager.acquire(
        Lifecycle.make(
          () => i,
          (n) => {
            releaseOrder.push(n);
          }
        )
      );
    }

    await manager.releaseAll();

    // Should be released in reverse order: 3, 2, 1
    expect(releaseOrder).toEqual([3, 2, 1]);
  });

  it('should use multiple resources and clean up automatically', async () => {
    const log: string[] = [];

    const manager = new LifecycleManager();

    const result = await manager.use(async () => {
      await manager.acquire(
        Lifecycle.make(
          () => {
            log.push('acquire-1');
            return 'r1';
          },
          () => {
            log.push('release-1');
          }
        )
      );

      await manager.acquire(
        Lifecycle.make(
          () => {
            log.push('acquire-2');
            return 'r2';
          },
          () => {
            log.push('release-2');
          }
        )
      );

      log.push('use');
      return 'result';
    });

    expect(result).toBe('result');
    expect(log).toEqual([
      'acquire-1',
      'acquire-2',
      'use',
      'release-2',
      'release-1',
    ]);
  });

  it('should collect errors from failed releases', async () => {
    const manager = new LifecycleManager();

    await manager.acquire(
      Lifecycle.make(
        () => 'r1',
        () => {
          throw new Error('Error 1');
        }
      )
    );

    await manager.acquire(
      Lifecycle.make(
        () => 'r2',
        () => {
          throw new Error('Error 2');
        }
      )
    );

    try {
      await manager.releaseAll();
      expect.fail('Should have thrown AggregateLifecycleError');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateLifecycleError);
      const aggError = error as AggregateLifecycleError;
      expect(aggError.errors).toHaveLength(2);
      expect(aggError.errors[0].message).toBe('Error 2');
      expect(aggError.errors[1].message).toBe('Error 1');
    }
  });

  it('should continue releasing all resources even if some fail', async () => {
    const released: string[] = [];
    const manager = new LifecycleManager();

    await manager.acquire(
      Lifecycle.make(
        () => 'r1',
        () => {
          released.push('r1');
        }
      )
    );

    await manager.acquire(
      Lifecycle.make(
        () => 'r2',
        () => {
          throw new Error('Error 2');
        }
      )
    );

    await manager.acquire(
      Lifecycle.make(
        () => 'r3',
        () => {
          released.push('r3');
        }
      )
    );

    try {
      await manager.releaseAll();
    } catch (error) {
      // Expected
    }

    // r1 and r3 should still be released despite r2 failing
    expect(released).toEqual(['r3', 'r1']);
  });

  describe('Real-world example: Multiple database connections', () => {
    class Connection {
      constructor(
        public readonly name: string,
        public open = false,
      ) {}

      connect() {
        this.open = true;
      }

      close() {
        this.open = false;
      }
    }

    it('should manage multiple database connections', async () => {
      const manager = new LifecycleManager();

      const connections = await manager.use(async () => {
        const db1 = await manager.acquire(
          Lifecycle.make(
            () => {
              const conn = new Connection('db1');
              conn.connect();
              return conn;
            },
            (conn) => conn.close()
          )
        );

        const db2 = await manager.acquire(
          Lifecycle.make(
            () => {
              const conn = new Connection('db2');
              conn.connect();
              return conn;
            },
            (conn) => conn.close()
          )
        );

        expect(db1.open).toBe(true);
        expect(db2.open).toBe(true);

        return [db1, db2];
      });

      // After use(), connections should be closed
      expect(connections[0].open).toBe(false);
      expect(connections[1].open).toBe(false);
    });
  });
});
