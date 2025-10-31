import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Id, Reflected } from '../src/distage';

// Test classes
class Config {
  constructor(public readonly value: string = 'default') {}
}

@Reflected(Config)
class Database {
  constructor(public readonly config: Config) {}
}

@Reflected(Database, Config)
class UserService {
  constructor(public readonly db: Database, public readonly config: Config) {}
}

class Logger {
  log(msg: string): void {
    console.log(msg);
  }
}

@Reflected(Logger, Database)
class Service {
  constructor(
    public readonly logger: Logger,
    @Id('primary') public readonly db: Database,
  ) {}
}

describe('Basic Dependency Injection', () => {
  it('should inject simple dependencies', () => {
    const module = new ModuleDef()
      .make(Config).from().value(new Config('test'))
      .make(Database).from().type(Database)
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service).toBeInstanceOf(UserService);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.config.value).toBe('test');
  });

  it('should share singleton instances', () => {
    const module = new ModuleDef()
      .make(Config).from().value(new Config('shared'))
      .make(Database).from().type(Database)
      .make(UserService).from().type(UserService);

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
      .make(Logger).from().value(new Logger())
      .make(Database).from().value(primaryDb) // Default database
      .make(Database).named('primary').from().value(primaryDb)
      .make(Database).named('secondary').from().value(secondaryDb)
      .make(Service).from().type(Service);

    const injector = new Injector();
    const service = injector.produceByType(module, Service);

    expect(service).toBeInstanceOf(Service);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.logger).toBeInstanceOf(Logger);
  });

  it('should support factory bindings', () => {
    const module = new ModuleDef()
      .make(Config).from().value(new Config('factory-test'))
      .make(Database).from().type(Database)
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service).toBeInstanceOf(UserService);
    expect(service.db.config.value).toBe('factory-test');
  });

  it('should support fromValue bindings', () => {
    const config = new Config('specific-value');

    const module = new ModuleDef()
      .make(Config).from().value(config);

    const injector = new Injector();
    const result = injector.produceByType(module, Config);

    expect(result).toBe(config);
  });

  it('should support alias bindings', () => {
        abstract class IDatabase {
      abstract config: Config;
    }

    @Reflected(Config)
    class PostgresDatabase extends IDatabase {
      constructor(public readonly config: Config) {
        super();
      }
    }

    const module = new ModuleDef()
      .make(Config).from().value(new Config('postgres'))
      .make(PostgresDatabase).from().type(PostgresDatabase)
      .make(IDatabase as any).from().alias(PostgresDatabase);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(IDatabase as any)]);

    const db = locator.get(DIKey.of(IDatabase as any)) as IDatabase;
    const postgresDb = locator.get(DIKey.of(PostgresDatabase));

    expect(db).toBe(postgresDb);
    expect(db.config.value).toBe('postgres');
  });

  it('should support @Reflected with primitive types and named dependencies', () => {
    @Reflected(Database, String, Number)
    class Server {
      constructor(
        public readonly db: Database,
        public readonly host: string,
        @Id('port') public readonly port: number,
      ) {}
    }

    const config = new Config('server-db');
    const module = new ModuleDef()
      .make(Config).from().value(config)
      .make(Database).from().type(Database)
      .make(Server).from().type(Server)
      .make(String).from().value('localhost')
      .make(Number).named('port').from().value(8080);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(Server)]);

    const server = locator.get(DIKey.of(Server));
    expect(server).toBeInstanceOf(Server);
    expect(server.db).toBeInstanceOf(Database);
    expect(server.db.config).toBe(config);
    expect(server.host).toBe('localhost');
    expect(server.port).toBe(8080);
  });
});
