import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Reflected, Id } from '../src/distage';

// Test interfaces and implementations
interface IGreeter {
  greet(name: string): string;
}

interface ILogger {
  log(message: string): void;
}

interface IDatabase {
  connect(): Promise<void>;
  query(sql: string): Promise<any[]>;
}

// Symbol tokens to represent interfaces at runtime
const IGreeter = Symbol('IGreeter');
const ILogger = Symbol('ILogger');
const IDatabase = Symbol('IDatabase');

// Implementations
class EnglishGreeter implements IGreeter {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

class SpanishGreeter implements IGreeter {
  greet(name: string): string {
    return `¡Hola, ${name}!`;
  }
}

class ConsoleLogger implements ILogger {
  messages: string[] = [];

  log(message: string): void {
    this.messages.push(message);
  }
}

class MockDatabase implements IDatabase {
  isConnected = false;

  async connect(): Promise<void> {
    this.isConnected = true;
  }

  async query(sql: string): Promise<any[]> {
    return [];
  }
}

@Reflected(ILogger)
class Service {
  constructor(@Id(ILogger) public readonly logger: ILogger) {}
}

describe('Interface Token Bindings', () => {
  it('should bind implementations to interface tokens', () => {
    const module = new ModuleDef()
      .make(IGreeter).from().type(EnglishGreeter);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.token<IGreeter>(IGreeter)]);

    const greeter = locator.get(DIKey.token<IGreeter>(IGreeter));
    expect(greeter).toBeInstanceOf(EnglishGreeter);
    expect(greeter.greet('World')).toBe('Hello, World!');
  });

  it('should support named bindings with interface tokens', () => {
    const module = new ModuleDef()
      .make(IGreeter).named('english').from().type(EnglishGreeter)
      .make(IGreeter).named('spanish').from().type(SpanishGreeter);

    const injector = new Injector();
    const locator = injector.produce(module, [
      DIKey.namedToken<IGreeter>(IGreeter, 'english'),
      DIKey.namedToken<IGreeter>(IGreeter, 'spanish'),
    ]);

    const englishGreeter = locator.get(DIKey.namedToken<IGreeter>(IGreeter, 'english'));
    const spanishGreeter = locator.get(DIKey.namedToken<IGreeter>(IGreeter, 'spanish'));

    expect(englishGreeter.greet('World')).toBe('Hello, World!');
    expect(spanishGreeter.greet('Mundo')).toBe('¡Hola, Mundo!');
  });

  it('should support value bindings with interface tokens', () => {
    const logger = new ConsoleLogger();

    const module = new ModuleDef()
      .make(ILogger).from().value(logger);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.token<ILogger>(ILogger)]);

    const retrievedLogger = locator.get(DIKey.token<ILogger>(ILogger));
    expect(retrievedLogger).toBe(logger);

    retrievedLogger.log('test message');
    expect(logger.messages).toContain('test message');
  });

  it('should support factory bindings with interface tokens', async () => {
    const module = new ModuleDef()
      .make(IDatabase).from().func(
        [],
        async () => {
          const db = new MockDatabase();
          await db.connect();
          return db;
        }
      );

    const injector = new Injector();
    const locator = await injector.produceAsync(module, [DIKey.token<IDatabase>(IDatabase)]);

    const db = locator.get(DIKey.token<IDatabase>(IDatabase));
    expect(db).toBeInstanceOf(MockDatabase);
    expect(db.isConnected).toBe(true);
  });

  it('should support set bindings with interface tokens', () => {
    const module = new ModuleDef()
      .many(IGreeter).from().type(EnglishGreeter)
      .many(IGreeter).from().type(SpanishGreeter);

    const injector = new Injector();
    const locator = injector.produce(module, [DIKey.setToken<IGreeter>(IGreeter)]);

    const greeters = locator.get(DIKey.setToken<IGreeter>(IGreeter));
    expect(greeters.size).toBe(2);

    const greetings = Array.from(greeters).map(g => g.greet('Test'));
    expect(greetings).toContain('Hello, Test!');
    expect(greetings).toContain('¡Hola, Test!');
  });

  it('should support named set bindings with interface tokens', () => {
    const module = new ModuleDef()
      .many(IGreeter).named('primary').from().type(EnglishGreeter)
      .many(IGreeter).named('secondary').from().type(SpanishGreeter);

    const injector = new Injector();
    const locator = injector.produce(module, [
      DIKey.namedSetToken<IGreeter>(IGreeter, 'primary'),
      DIKey.namedSetToken<IGreeter>(IGreeter, 'secondary'),
    ]);

    const primaryGreeters = locator.get(DIKey.namedSetToken<IGreeter>(IGreeter, 'primary'));
    const secondaryGreeters = locator.get(DIKey.namedSetToken<IGreeter>(IGreeter, 'secondary'));

    expect(primaryGreeters.size).toBe(1);
    expect(secondaryGreeters.size).toBe(1);
  });

  it('should inject interface tokens as dependencies', () => {
    const logger = new ConsoleLogger();

    const module = new ModuleDef()
      .make(ILogger).from().value(logger)
      .make(Service).from().type(Service);

    const injector = new Injector();
    const service = injector.produceByType(module, Service);

    expect(service.logger).toBe(logger);
    service.logger.log('dependency injection works!');
    expect(logger.messages).toContain('dependency injection works!');
  });

  it('should support alias bindings between interface tokens', () => {
    const module = new ModuleDef()
      .make(IGreeter).named('default').from().type(EnglishGreeter)
      .make(IGreeter).from().alias(DIKey.namedToken(IGreeter, 'default'));

    const injector = new Injector();
    const locator = injector.produce(module, [
      DIKey.token<IGreeter>(IGreeter),
      DIKey.namedToken<IGreeter>(IGreeter, 'default'),
    ]);

    const greeter = locator.get(DIKey.token<IGreeter>(IGreeter));
    const defaultGreeter = locator.get(DIKey.namedToken<IGreeter>(IGreeter, 'default'));

    expect(greeter).toBe(defaultGreeter);
    expect(greeter).toBeInstanceOf(EnglishGreeter);
  });
});
