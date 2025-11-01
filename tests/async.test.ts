import { describe, it, expect } from 'vitest';
import {
  Injector,
  ModuleDef,
  DIKey,
  Functoid,
  Reflected,
} from '../src/distage';

describe('Async Dependency Injection', () => {
  describe('Async factories', () => {
    it('should support async factory functions', async () => {
      class Config {
        constructor(public readonly value: string) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            // Simulate async configuration loading
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('async-loaded');
          }
        );

      const injector = new Injector();
      const locator = await injector.produceAsync(module, [DIKey.of(Config)]);

      const config = locator.get(DIKey.of(Config));
      expect(config.value).toBe('async-loaded');
    });

    it('should support async constructors', async () => {
      class Database {
        connected = false;

        async connect() {
          await new Promise(resolve => setTimeout(resolve, 10));
          this.connected = true;
        }
      }

      // Create an async factory for Database
      const module = new ModuleDef()
        .make(Database)
        .from()
        .func(
          [],
          async () => {
            const db = new Database();
            await db.connect();
            return db;
          }
        );

      const injector = new Injector();
      const locator = await injector.produceAsync(module, [DIKey.of(Database)]);

      const db = locator.get(DIKey.of(Database));
      expect(db.connected).toBe(true);
    });

    it('should handle async dependencies', async () => {
      class Config {
        constructor(public readonly apiUrl: string) {}
      }

      @Reflected(Config)
      class ApiClient {
        constructor(public readonly config: Config) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('https://api.example.com');
          }
        )
        .make(ApiClient)
        .from()
        .type(ApiClient);

      const injector = new Injector();
      const locator = await injector.produceAsync(module, [DIKey.of(ApiClient)]);

      const client = locator.get(DIKey.of(ApiClient));
      expect(client.config.apiUrl).toBe('https://api.example.com');
    });
  });

  describe('Mixed sync and async', () => {
    it('should handle mixed sync and async factories', async () => {
      class Config {
        constructor(public readonly value: string) {}
      }

      class Logger {
        constructor(public readonly name: string) {}
      }

      @Reflected(Config, Logger)
      class Service {
        constructor(
          public readonly config: Config,
          public readonly logger: Logger,
        ) {}
      }

      const module = new ModuleDef()
        // Async factory
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('async-config');
          }
        )
        // Sync factory
        .make(Logger)
        .from()
        .func([], () => new Logger('sync-logger'))
        // Service depends on both
        .make(Service)
        .from()
        .type(Service);

      const injector = new Injector();
      const locator = await injector.produceAsync(module, [DIKey.of(Service)]);

      const service = locator.get(DIKey.of(Service));
      expect(service.config.value).toBe('async-config');
      expect(service.logger.name).toBe('sync-logger');
    });
  });

  describe('Parallel execution', () => {
    it('should execute independent async factories in parallel', async () => {
      const executionOrder: string[] = [];

      class ConfigA {
        constructor(public readonly value: string) {}
      }

      class ConfigB {
        constructor(public readonly value: string) {}
      }

      const module = new ModuleDef()
        .make(ConfigA)
        .from()
        .func(
          [],
          async () => {
            executionOrder.push('configA-start');
            await new Promise(resolve => setTimeout(resolve, 50));
            executionOrder.push('configA-end');
            return new ConfigA('A');
          }
        )
        .make(ConfigB)
        .from()
        .func(
          [],
          async () => {
            executionOrder.push('configB-start');
            await new Promise(resolve => setTimeout(resolve, 50));
            executionOrder.push('configB-end');
            return new ConfigB('B');
          }
        );

      const injector = new Injector();
      const startTime = Date.now();
      const locator = await injector.produceAsync(module, [
        DIKey.of(ConfigA),
        DIKey.of(ConfigB),
      ]);
      const duration = Date.now() - startTime;

      const configA = locator.get(DIKey.of(ConfigA));
      const configB = locator.get(DIKey.of(ConfigB));

      expect(configA.value).toBe('A');
      expect(configB.value).toBe('B');

      // Both should start before either finishes (parallel execution)
      expect(executionOrder).toContain('configA-start');
      expect(executionOrder).toContain('configB-start');

      // Should take ~50ms (parallel), not ~100ms (sequential)
      expect(duration).toBeLessThan(80); // Some margin for timing
    });

    it('should respect dependency order even with parallel execution', async () => {
      const executionOrder: string[] = [];

      class Database {
        constructor(public readonly name: string) {}
      }

      @Reflected(Database)
      class Repository {
        constructor(public readonly db: Database) {
          executionOrder.push('repository-created');
        }
      }

      const module = new ModuleDef()
        .make(Database)
        .from()
        .func(
          [],
          async () => {
            executionOrder.push('database-start');
            await new Promise(resolve => setTimeout(resolve, 20));
            executionOrder.push('database-end');
            return new Database('main');
          }
        )
        .make(Repository)
        .from()
        .type(Repository);

      const injector = new Injector();
      await injector.produceAsync(module, [DIKey.of(Repository)]);

      // Repository creation must happen after database is fully created
      const dbEndIndex = executionOrder.indexOf('database-end');
      const repoCreatedIndex = executionOrder.indexOf('repository-created');

      expect(dbEndIndex).toBeGreaterThanOrEqual(0);
      expect(repoCreatedIndex).toBeGreaterThanOrEqual(0);
      expect(repoCreatedIndex).toBeGreaterThan(dbEndIndex);
    });

    it('should execute multiple independent dependency chains in parallel', async () => {
      class ConfigA {}
      class ServiceA {
        constructor(public readonly config: ConfigA) {}
      }

      class ConfigB {}
      class ServiceB {
        constructor(public readonly config: ConfigB) {}
      }

      const module = new ModuleDef()
        // Chain A
        .make(ConfigA)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return new ConfigA();
          }
        )
        .make(ServiceA)
        .from()
        .func(
          [ConfigA],
          async (config) => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return new ServiceA(config);
          }
        )
        // Chain B (independent of A)
        .make(ConfigB)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return new ConfigB();
          }
        )
        .make(ServiceB)
        .from()
        .func(
          [ConfigB],
          async (config) => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return new ServiceB(config);
          }
        );

      const injector = new Injector();
      const startTime = Date.now();
      await injector.produceAsync(module, [
        DIKey.of(ServiceA),
        DIKey.of(ServiceB),
      ]);
      const duration = Date.now() - startTime;

      // Each chain takes 60ms, but they run in parallel
      // Should take ~60ms, not ~120ms
      expect(duration).toBeLessThan(90); // Some margin for timing
    });
  });

  describe('Convenience methods', () => {
    it('should support produceOneAsync', async () => {
      class Config {
        constructor(public readonly value: string) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('test');
          }
        );

      const injector = new Injector();
      const config = await injector.produceOneAsync(module, DIKey.of(Config));

      expect(config.value).toBe('test');
    });

    it('should support produceByTypeAsync', async () => {
      class Config {
        constructor(public readonly value: string) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('test');
          }
        );

      const injector = new Injector();
      const config = await injector.produceByTypeAsync(module, Config);

      expect(config.value).toBe('test');
    });

    it('should support produceByTypeAndIdAsync', async () => {
      class Config {
        constructor(public readonly value: string) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .named('primary')
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return new Config('primary-config');
          }
        );

      const injector = new Injector();
      const config = await injector.produceByTypeAndIdAsync(
        module,
        Config,
        'primary'
      );

      expect(config.value).toBe('primary-config');
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from async factories', async () => {
      class Config {}

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('Failed to load config');
          }
        );

      const injector = new Injector();

      await expect(
        injector.produceAsync(module, [DIKey.of(Config)])
      ).rejects.toThrow('Failed to load config');
    });

    it('should handle errors in dependent async factories', async () => {
      class Config {}

      class Service {
        constructor(public readonly config: Config) {}
      }

      const module = new ModuleDef()
        .make(Config)
        .from()
        .func(
          [],
          async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('Config load failed');
          }
        )
        .make(Service)
        .from()
        .func([Config], async (config) => {
          return new Service(config);
        });

      const injector = new Injector();

      await expect(
        injector.produceAsync(module, [DIKey.of(Service)])
      ).rejects.toThrow('Config load failed');
    });
  });

  describe('Real-world example: Async database connection', () => {
    class DatabaseConfig {
      constructor(
        public readonly host: string,
        public readonly port: number,
      ) {}
    }

    class Database {
      connected = false;

      constructor(
        public readonly config: DatabaseConfig,
        public connectionId: string = '',
      ) {}

      async connect() {
        await new Promise(resolve => setTimeout(resolve, 20));
        this.connectionId = `${this.config.host}:${this.config.port}`;
        this.connected = true;
      }
    }

    @Reflected(Database)
    class UserRepository {
      constructor(public readonly db: Database) {}

      async getUsers() {
        if (!this.db.connected) {
          throw new Error('Database not connected');
        }
        return ['user1', 'user2'];
      }
    }

    it('should handle async database connection lifecycle', async () => {
      const module = new ModuleDef()
        .make(DatabaseConfig)
        .from()
        .func(
          [],
          async () => {
            // Simulate loading config from file
            await new Promise(resolve => setTimeout(resolve, 10));
            return new DatabaseConfig('localhost', 5432);
          }
        )
        .make(Database)
        .from()
        .func(
          [DatabaseConfig],
          async (config) => {
            const db = new Database(config);
            await db.connect();
            return db;
          }
        )
        .make(UserRepository)
        .from()
        .type(UserRepository);

      const injector = new Injector();
      const locator = await injector.produceAsync(module, [
        DIKey.of(UserRepository),
      ]);

      const repo = locator.get(DIKey.of(UserRepository));
      expect(repo.db.connected).toBe(true);
      expect(repo.db.connectionId).toBe('localhost:5432');

      const users = await repo.getUsers();
      expect(users).toEqual(['user1', 'user2']);
    });
  });
});
