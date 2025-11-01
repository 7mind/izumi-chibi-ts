import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, ApplyReflection, Reflected, Id } from '../src/distage';

describe('ApplyReflection - Third-party class metadata', () => {
  class Database {
    query(sql: string): string {
      return `Result: ${sql}`;
    }
  }

  class Config {
    constructor(public readonly value: string) {}
  }

  describe('Basic usage', () => {
    it('should add metadata to third-party class via namespace', () => {
      // Simulating a third-party class we cannot modify
      class ThirdPartyService {
        constructor(
          public readonly db: Database,
          public readonly config: Config,
        ) {}
      }

      // Add metadata via companion function
      ApplyReflection(ThirdPartyService, Database, Config);

      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(ThirdPartyService).from().type(ThirdPartyService);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(ThirdPartyService)]);

      const service = locator.get(DIKey.of(ThirdPartyService));
      expect(service).toBeInstanceOf(ThirdPartyService);
      expect(service.db).toBeInstanceOf(Database);
      expect(service.config.value).toBe('test');
    });

    it('should work with single dependency', () => {
      class ThirdPartyLogger {
        constructor(public readonly config: Config) {}
      }

      ApplyReflection(ThirdPartyLogger, Config);

      const module = new ModuleDef()
        .make(Config).from().value(new Config('logger-config'))
        .make(ThirdPartyLogger).from().type(ThirdPartyLogger);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(ThirdPartyLogger)]);

      const logger = locator.get(DIKey.of(ThirdPartyLogger));
      expect(logger.config.value).toBe('logger-config');
    });

    it('should work with no dependencies', () => {
      class ThirdPartyUtil {
        constructor() {}

        getValue(): string {
          return 'utility';
        }
      }

      ApplyReflection(ThirdPartyUtil);

      const module = new ModuleDef()
        .make(ThirdPartyUtil).from().type(ThirdPartyUtil);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(ThirdPartyUtil)]);

      const util = locator.get(DIKey.of(ThirdPartyUtil));
      expect(util.getValue()).toBe('utility');
    });
  });

  describe('With @Id decorators', () => {
    it('should work with named dependencies', () => {
      // Third-party class with @Id decorator
      class ThirdPartyCache {
        constructor(
          @Id('primary') public readonly db: Database,
          public readonly config: Config,
        ) {}
      }

      ApplyReflection(ThirdPartyCache, Database, Config);

      const primaryDb = new Database();
      const module = new ModuleDef()
        .make(Database).named('primary').from().value(primaryDb)
        .make(Config).from().value(new Config('cache-config'))
        .make(ThirdPartyCache).from().type(ThirdPartyCache);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(ThirdPartyCache)]);

      const cache = locator.get(DIKey.of(ThirdPartyCache));
      expect(cache.db).toBe(primaryDb);
      expect(cache.config.value).toBe('cache-config');
    });
  });

  describe('Error handling', () => {
    it('should throw error on parameter count mismatch', () => {
      class ThirdPartyService {
        constructor(db: Database, config: Config) {}
      }

      expect(() => {
        ApplyReflection(ThirdPartyService, Database); // Wrong: missing Config
      }).toThrow(/Parameter count mismatch.*Expected 2 types, got 1/);
    });

    it('should throw error on too many types', () => {
      class ThirdPartyService {
        constructor(db: Database) {}
      }

      expect(() => {
        ApplyReflection(ThirdPartyService, Database, Config); // Wrong: too many
      }).toThrow(/Parameter count mismatch.*Expected 1 types, got 2/);
    });
  });

  describe('Comparison with @Reflected', () => {
    it('should behave identically to @Reflected decorator', () => {
      // Regular class with @Reflected
      class OwnService {
        constructor(
          public readonly db: Database,
          public readonly config: Config,
        ) {}
      }

      // Can't use @Reflected on namespace, so test separately
      const OwnServiceReflected = Reflected(Database, Config)(OwnService);

      // Third-party class with @ApplyReflection
      class ThirdPartyService {
        constructor(
          public readonly db: Database,
          public readonly config: Config,
        ) {}
      }

      ApplyReflection(ThirdPartyService, Database, Config);

      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('test'))
        .make(OwnService).from().type(OwnServiceReflected)
        .make(ThirdPartyService).from().type(ThirdPartyService);

      const injector = new Injector();
      const locator = injector.produce(module, [
        DIKey.of(OwnService),
        DIKey.of(ThirdPartyService),
      ]);

      const ownService = locator.get(DIKey.of(OwnService));
      const thirdPartyService = locator.get(DIKey.of(ThirdPartyService));

      // Both should work the same way
      expect(ownService.db).toBeInstanceOf(Database);
      expect(thirdPartyService.db).toBeInstanceOf(Database);
      expect(ownService.config.value).toBe('test');
      expect(thirdPartyService.config.value).toBe('test');
    });
  });

  describe('Use case: Library classes', () => {
    it('should work with classes from external libraries', () => {
      // Simulating external library classes
      class LibraryHttpClient {
        constructor(public readonly config: Config) {}

        get(url: string): string {
          return `GET ${url}`;
        }
      }

      class LibraryCache {
        constructor(
          public readonly db: Database,
          public readonly client: LibraryHttpClient,
        ) {}
      }

      // Add metadata for library classes
      ApplyReflection(LibraryHttpClient, Config);
      ApplyReflection(LibraryCache, Database, LibraryHttpClient);

      const module = new ModuleDef()
        .make(Database).from().type(Database)
        .make(Config).from().value(new Config('http-config'))
        .make(LibraryHttpClient).from().type(LibraryHttpClient)
        .make(LibraryCache).from().type(LibraryCache);

      const injector = new Injector();
      const locator = injector.produce(module, [DIKey.of(LibraryCache)]);

      const cache = locator.get(DIKey.of(LibraryCache));
      expect(cache).toBeInstanceOf(LibraryCache);
      expect(cache.db).toBeInstanceOf(Database);
      expect(cache.client).toBeInstanceOf(LibraryHttpClient);
      expect(cache.client.get('/api')).toBe('GET /api');
    });
  });
});
