import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Id, Injectable, Inject } from '../src/index.js';

// Test classes
@Injectable()
class Config {
  constructor(public readonly value: string = 'default') {}
}

@Injectable()
class Database {
  constructor(@Inject() public readonly config: Config) {}
}

@Injectable()
class UserService {
  constructor(@Inject() public readonly db: Database, @Inject() public readonly config: Config) {}
}

@Injectable()
class Logger {
  log(msg: string): void {
    console.log(msg);
  }
}

@Injectable()
class Service {
  constructor(
    @Inject() public readonly logger: Logger,
    @Inject() @Id('primary') public readonly db: Database,
  ) {}
}

describe('Basic Dependency Injection', () => {
  it('should inject simple dependencies', () => {
    const module = new ModuleDef()
      .make(Config).fromValue(new Config('test'))
      .make(Database).fromSelf()
      .make(UserService).fromSelf();

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service).toBeInstanceOf(UserService);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.config.value).toBe('test');
  });

  it('should share singleton instances', () => {
    const module = new ModuleDef()
      .make(Config).fromValue(new Config('shared'))
      .make(Database).fromSelf()
      .make(UserService).fromSelf();

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(UserService)]);

    const service = locator.get(DIKey.of(UserService));
    const db = locator.get(DIKey.of(Database));
    const config = locator.get(DIKey.of(Config));

    // All should be the same instances
    expect(service.db).toBe(db);
    expect(service.config).toBe(config);
    expect(db.config).toBe(config);
  });

  it('should support named bindings with @Id decorator', () => {
    const primaryDb = new Database(new Config('primary'));
    const secondaryDb = new Database(new Config('secondary'));

    const module = new ModuleDef()
      .make(Logger).fromValue(new Logger())
      .make(Database).fromValue(primaryDb) // Default database
      .make(Database).named('primary').fromValue(primaryDb)
      .make(Database).named('secondary').fromValue(secondaryDb)
      .make(Service).fromSelf();

    const injector = new Injector();
    const service = injector.produceByType(module, Service);

    expect(service).toBeInstanceOf(Service);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.logger).toBeInstanceOf(Logger);
  });

  it('should support factory bindings', () => {
    const module = new ModuleDef()
      .make(Config).fromValue(new Config('factory-test'))
      .make(Database).fromClass(Database)
      .make(UserService).fromSelf();

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service).toBeInstanceOf(UserService);
    expect(service.db.config.value).toBe('factory-test');
  });

  it('should support fromValue bindings', () => {
    const config = new Config('specific-value');

    const module = new ModuleDef()
      .make(Config).fromValue(config);

    const injector = new Injector();
    const result = injector.produceByType(module, Config);

    expect(result).toBe(config);
  });

  it('should support alias bindings', () => {
    @Injectable()
    abstract class IDatabase {
      abstract config: Config;
    }

    @Injectable()
    class PostgresDatabase extends IDatabase {
      constructor(public readonly config: Config) {
        super();
      }
    }

    const module = new ModuleDef()
      .make(Config).fromValue(new Config('postgres'))
      .make(PostgresDatabase).fromSelf()
      .make(IDatabase as any).fromAlias(PostgresDatabase);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(IDatabase as any)]);

    const db = locator.get(DIKey.of(IDatabase as any));
    const postgresDb = locator.get(DIKey.of(PostgresDatabase));

    expect(db).toBe(postgresDb);
    expect(db.config.value).toBe('postgres');
  });
});
