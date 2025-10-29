import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Injectable, Axis, AxisPoint, Activation } from '../src/index.js';

describe('New DSL Syntax (izumi-chibi-py style)', () => {
  @Injectable()
  class Config {
    constructor(public readonly value: string) {}
  }

  @Injectable()
  abstract class Database {
    abstract query(sql: string): string;
  }

  @Injectable()
  class PostgresDatabase extends Database {
    query(sql: string): string {
      return `[Postgres] ${sql}`;
    }
  }

  @Injectable()
  class MySQLDatabase extends Database {
    query(sql: string): string {
      return `[MySQL] ${sql}`;
    }
  }

  @Injectable()
  class UserService {
    constructor(
      public readonly db: Database,
      public readonly config: Config,
    ) {}
  }

  it('should support .from().type() for class bindings', () => {
    const module = new ModuleDef()
      .make(Database).from().type(PostgresDatabase)
      .make(Config).from().value(new Config('test'))
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service.db).toBeInstanceOf(PostgresDatabase);
    expect(service.config.value).toBe('test');
  });

  it('should support .from().value() for instance bindings', () => {
    const dbInstance = new PostgresDatabase();
    const configInstance = new Config('production');

    const module = new ModuleDef()
      .make(Database).from().value(dbInstance)
      .make(Config).from().value(configInstance)
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service.db).toBe(dbInstance);
    expect(service.config).toBe(configInstance);
  });

  it('should support .from().factory() for factory bindings', () => {
    const module = new ModuleDef()
      .make(Config).from().value(new Config('test'))
      .make(Database).from().factory(() => {
        return new PostgresDatabase();
      })
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const service = injector.produceByType(module, UserService);

    expect(service.db).toBeInstanceOf(PostgresDatabase);
    expect(service.db.query('SELECT *')).toBe('[Postgres] SELECT *');
  });

  it('should support .from().alias() for alias bindings', () => {
    const module = new ModuleDef()
      .make(PostgresDatabase).from().type(PostgresDatabase)
      .make(Database).from().alias(PostgresDatabase)
      .make(Config).from().value(new Config('test'))
      .make(UserService).from().type(UserService);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(UserService)]);

    const service = locator.get(DIKey.of(UserService));
    const db = locator.get(DIKey.of(Database));
    const postgresDb = locator.get(DIKey.of(PostgresDatabase));

    expect(service.db).toBeInstanceOf(PostgresDatabase);
    expect(db).toBe(postgresDb); // Alias points to same instance
  });

  it('should work with axis tagging', () => {
    const Environment = Axis.of('Environment', ['Prod', 'Dev']);

    const module = new ModuleDef()
      .make(Database)
        .tagged(Environment, 'Prod')
        .from().type(PostgresDatabase)
      .make(Database)
        .tagged(Environment, 'Dev')
        .from().type(MySQLDatabase)
      .make(Config).from().value(new Config('test'))
      .make(UserService).from().type(UserService);

    const injector = new Injector();

    // Production
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const prodService = injector.produceByType(module, UserService, {
      activation: prodActivation,
    });
    expect(prodService.db).toBeInstanceOf(PostgresDatabase);

    // Development
    const devActivation = Activation.of(AxisPoint.of(Environment, 'Dev'));
    const devService = injector.produceByType(module, UserService, {
      activation: devActivation,
    });
    expect(devService.db).toBeInstanceOf(MySQLDatabase);
  });

  it('should work with set bindings', () => {
    @Injectable()
    abstract class Plugin {
      abstract getName(): string;
    }

    @Injectable()
    class AuthPlugin extends Plugin {
      getName(): string {
        return 'auth';
      }
    }

    @Injectable()
    class LoggingPlugin extends Plugin {
      getName(): string {
        return 'logging';
      }
    }

    const module = new ModuleDef()
      .many(Plugin).from().type(AuthPlugin)
      .many(Plugin).from().type(LoggingPlugin);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.set(Plugin as any)]);
    const plugins = locator.getSet(Plugin as any);

    expect(plugins.size).toBe(2);
    const names = Array.from(plugins).map(p => p.getName()).sort();
    expect(names).toEqual(['auth', 'logging']);
  });

  it('should support chaining .named() and .tagged() before .from()', () => {
    const Environment = Axis.of('Environment', ['Prod', 'Dev']);

    const module = new ModuleDef()
      .make(Config)
        .named('db-config')
        .tagged(Environment, 'Prod')
        .from().value(new Config('prod-db'))
      .make(Config)
        .named('api-config')
        .tagged(Environment, 'Prod')
        .from().value(new Config('prod-api'));

    const injector = new Injector();
    const prodActivation = Activation.of(AxisPoint.of(Environment, 'Prod'));
    const locator = injector.produce(
      module,
      [DIKey.named(Config, 'db-config'), DIKey.named(Config, 'api-config')],
      { activation: prodActivation },
    );

    const dbConfig = locator.get(DIKey.named(Config, 'db-config'));
    const apiConfig = locator.get(DIKey.named(Config, 'api-config'));

    expect(dbConfig.value).toBe('prod-db');
    expect(apiConfig.value).toBe('prod-api');
  });
});
