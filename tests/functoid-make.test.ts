import { describe, it, expect } from 'vitest';
import { Functoid, Injector, ModuleDef, DIKey } from '../src/distage';

describe('Functoid.make - Type-safe factory functions', () => {
  class Database {
    query(sql: string): string {
      return `Result: ${sql}`;
    }
  }

  class Config {
    constructor(public readonly port: number) {}
  }

  class UserService {
    constructor(
      public readonly db: Database,
      public readonly config: Config,
    ) {}

    getUser(id: string): any {
      return { id, data: this.db.query(`SELECT * FROM users WHERE id='${id}'`) };
    }
  }

  it('should create a type-safe Functoid with compile-time validation', () => {
    // Type-safe: TypeScript validates that function params match the types array
    const functoid = Functoid.fromFunction(
      [Database, Config],
      (db, config) => new UserService(db, config)
    );

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(2);
    expect(deps[0].getCallable()).toBe(Database);
    expect(deps[1].getCallable()).toBe(Config);
  });

  it('should work in a full DI context', () => {
    const functoid = Functoid.fromFunction(
      [Database, Config],
      (db, config) => new UserService(db, config)
    );

    const module = new ModuleDef()
      .make(Database).from().type(Database)
      .make(Config).from().value(new Config(8080))
      .make(UserService).from().factory(functoid);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of(UserService)]);

    const service = locator.get(DIKey.of(UserService));
    expect(service).toBeInstanceOf(UserService);
    expect(service.db).toBeInstanceOf(Database);
    expect(service.config).toBeInstanceOf(Config);
    expect(service.config.port).toBe(8080);

    const user = service.getUser('123');
    expect(user.id).toBe('123');
    expect(user.data).toContain('SELECT * FROM users');
  });

  it('should support multiple class dependencies', () => {
    class HostConfig {
      constructor(public readonly host: string = 'localhost') {}
    }

    class PortConfig {
      constructor(public readonly port: number = 3000) {}
    }

    const functoid = Functoid.fromFunction(
      [HostConfig, PortConfig],
      (hostCfg, portCfg) => ({
        host: hostCfg.host,
        port: portCfg.port,
        url: `http://${hostCfg.host}:${portCfg.port}`
      })
    );

    const module = new ModuleDef()
      .make(HostConfig).from().type(HostConfig)
      .make(PortConfig).from().type(PortConfig)
      .make('ServerConfig' as any).from().factory(functoid);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.of('ServerConfig' as any)]);

    const config = locator.get(DIKey.of('ServerConfig' as any)) as { host: string; port: number; url: string };
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(3000);
    expect(config.url).toBe('http://localhost:3000');
  });

  it('should support single parameter', () => {
    const functoid = Functoid.fromFunction(
      [Database],
      (db) => ({ database: db, initialized: true })
    );

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(1);
    expect(deps[0].getCallable()).toBe(Database);
  });

  it('should support no parameters', () => {
    const functoid = Functoid.fromFunction(
      [],
      () => ({ timestamp: Date.now() })
    );

    const deps = functoid.getDependencies();
    expect(deps.length).toBe(0);
  });

  // These would cause TypeScript compile errors (commented out for test to run):

  // These would cause TypeScript compile errors:
  //
  // // ✗ Compile error: Expected 2 params, got 1
  // Functoid.make(
  //   [Database],
  //   (db, config) => new UserService(db, config)
  // );
  //
  // // ✗ Compile error: Wrong parameter order - Config is not assignable to Database
  // Functoid.make(
  //   [Config, Database],
  //   (db, config) => new UserService(db, config)
  // );
});
