import { describe, it, expect } from 'vitest';
import { Functoid, Injector, ModuleDef, DIKey } from '../src/distage';

describe('DSL .func() and .functoid() methods', () => {
  class Database {
    query(sql: string): string {
      return `Result: ${sql}`;
    }
  }

  class Config {
    constructor(public readonly value: string) {}
  }

  class UserService {
    constructor(
      public readonly db: Database,
      public readonly config: Config,
    ) {}
  }

  abstract class Plugin {
    abstract getName(): string;
  }

  class AuthPlugin extends Plugin {
    constructor(private readonly db: Database) {
      super();
    }
    getName(): string {
      return 'auth';
    }
  }

  class LoggingPlugin extends Plugin {
    getName(): string {
      return 'logging';
    }
  }

  describe('.from().func()', () => {
    it('should bind using inline type-safe factory function', () => {
      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(UserService).from().func(
          [Database, Config] as const,
          (db, config) => new UserService(db, config)
        );

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(UserService)]);

      const service = locator.get(DIKey.of(UserService));
      expect(service).toBeInstanceOf(UserService);
      expect(service.db).toBeInstanceOf(Database);
      expect(service.config.value).toBe('test');
    });

    it('should work with no parameters', () => {
      const module = new ModuleDef()
        .make(Config).from().func(
          [] as const,
          () => new Config('generated')
        );

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(Config)]);

      const config = locator.get(DIKey.of(Config));
      expect(config.value).toBe('generated');
    });

    it('should work with single parameter', () => {
      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(UserService).from().func(
          [Database] as const,
          (db) => new UserService(db, new Config('inline'))
        );

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(UserService)]);

      const service = locator.get(DIKey.of(UserService));
      expect(service.db).toBeInstanceOf(Database);
      expect(service.config.value).toBe('inline');
    });
  });

  describe('.from().functoid()', () => {
    it('should bind using pre-constructed Functoid', () => {
      const functoid = Functoid.fromFunction(
        [Database, Config] as const,
        (db, config) => new UserService(db, config)
      );

      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(UserService).from().functoid(functoid);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(UserService)]);

      const service = locator.get(DIKey.of(UserService));
      expect(service).toBeInstanceOf(UserService);
      expect(service.config.value).toBe('test');
    });

    it('should allow reusing Functoids across multiple bindings', () => {
      const configFunctoid = Functoid.fromFunction(
        [] as const,
        () => new Config('shared')
      );

      const module = new ModuleDef()
        .make(Config).named('config1').from().functoid(configFunctoid)
        .make(Config).named('config2').from().functoid(configFunctoid);

      const injector = new Injector();
      const locator = injector.produce(module, [
        DIKey.named(Config, 'config1'),
        DIKey.named(Config, 'config2'),
      ]);

      const config1 = locator.get(DIKey.named(Config, 'config1'));
      const config2 = locator.get(DIKey.named(Config, 'config2'));

      expect(config1.value).toBe('shared');
      expect(config2.value).toBe('shared');
      // Different instances
      expect(config1).not.toBe(config2);
    });
  });

  describe('Sets: .many().from().func()', () => {
    it('should add elements to set using inline factory', () => {
      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .many(Plugin).from().func(
          [Database] as const,
          (db) => new AuthPlugin(db)
        )
        .many(Plugin).from().func(
          [] as const,
          () => new LoggingPlugin()
        );

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.set(Plugin as any)]);

      const plugins = locator.getSet(Plugin as any) as Set<Plugin>;
      expect(plugins.size).toBe(2);

      const names = Array.from(plugins).map(p => p.getName()).sort();
      expect(names).toEqual(['auth', 'logging']);
    });
  });

  describe('Sets: .many().from().functoid()', () => {
    it('should add elements to set using pre-constructed Functoid', () => {
      const authFunctoid = Functoid.fromFunction(
        [Database] as const,
        (db) => new AuthPlugin(db)
      );

      const loggingFunctoid = Functoid.fromFunction(
        [] as const,
        () => new LoggingPlugin()
      );

      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .many(Plugin).from().functoid(authFunctoid)
        .many(Plugin).from().functoid(loggingFunctoid);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.set(Plugin as any)]);

      const plugins = locator.getSet(Plugin as any) as Set<Plugin>;
      expect(plugins.size).toBe(2);

      const names = Array.from(plugins).map(p => p.getName()).sort();
      expect(names).toEqual(['auth', 'logging']);
    });
  });

  describe('Comparison: .func() vs .factory(functoid)', () => {
    it('should produce equivalent results', () => {
      // Using .func()
      const module1 = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(UserService).from().func(
          [Database, Config] as const,
          (db, config) => new UserService(db, config)
        );

      // Using .factory() with Functoid
      const module2 = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(UserService).from().factory(
          Functoid.fromFunction(
            [Database, Config] as const,
            (db, config) => new UserService(db, config)
          )
        );

      const injector = new Injector();
      const locator1 = injector.produce(module1, [DIKey.of(UserService)]);
      const locator2 = injector.produce(module2, [DIKey.of(UserService)]);

      const service1 = locator1.get(DIKey.of(UserService));
      const service2 = locator2.get(DIKey.of(UserService));

      expect(service1).toBeInstanceOf(UserService);
      expect(service2).toBeInstanceOf(UserService);
      expect(service1.config.value).toBe(service2.config.value);
    });
  });
});
