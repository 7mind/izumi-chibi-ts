import { describe, it, expect } from 'vitest';
import {
  Injector,
  ModuleDef,
  DIKey,
  Injectable,
  Subcontext,
  createSubcontext,
} from '../src/index.js';

describe('Subcontext', () => {
  describe('Basic Subcontext Operations', () => {
    @Injectable()
    class Config {
      constructor(public readonly value: string) {}
    }

    @Injectable()
    class ParentService {
      constructor(public readonly config: Config) {}
    }

    @Injectable()
    class RequestId {
      constructor(public readonly id: string) {}
    }

    @Injectable()
    class RequestHandler {
      constructor(
        public readonly requestId: RequestId,
        public readonly parentService: ParentService,
      ) {}
    }

    it('should create a subcontext with local bindings', () => {
      // Parent module
      const parentModule = new ModuleDef()
        .make(Config).from().value(new Config('parent-config'))
        .make(ParentService).from().type(ParentService);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [
        DIKey.of(Config),
        DIKey.of(ParentService),
      ]);

      // Create subcontext with request-scoped binding
      const requestId = new RequestId('req-123');
      const subcontextModule = new ModuleDef()
        .make(RequestId).from().value(requestId)
        .make(RequestHandler).from().type(RequestHandler);

      const subcontext = createSubcontext(
        parentLocator,
        subcontextModule,
        [DIKey.of(RequestHandler)],
      );

      // Should be able to access both parent and child bindings
      const handler = subcontext.get(DIKey.of(RequestHandler));
      expect(handler.requestId).toBe(requestId);
      expect(handler.requestId.id).toBe('req-123');
      expect(handler.parentService.config.value).toBe('parent-config');

      // Should be able to access parent bindings directly
      const config = subcontext.get(DIKey.of(Config));
      expect(config.value).toBe('parent-config');
    });

    it('should allow child bindings to override parent bindings', () => {
      const parentModule = new ModuleDef()
        .make(Config).from().value(new Config('parent-config'));

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(Config)]);

      // Override config in subcontext
      const subcontextModule = new ModuleDef()
        .make(Config).from().value(new Config('child-config'));

      const subcontext = createSubcontext(
        parentLocator,
        subcontextModule,
        [DIKey.of(Config)],
      );

      // Child binding should take precedence
      const config = subcontext.get(DIKey.of(Config));
      expect(config.value).toBe('child-config');
    });

    it('should support finding keys that may not exist', () => {
      const parentModule = new ModuleDef()
        .make(Config).from().value(new Config('parent-config'));

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(Config)]);

      const subcontext = createSubcontext(
        parentLocator,
        new ModuleDef(),
        [],
      );

      // Should find parent binding
      const config = subcontext.find(DIKey.of(Config));
      expect(config).toBeDefined();
      expect(config!.value).toBe('parent-config');

      // Should return undefined for missing binding
      const missing = subcontext.find(DIKey.of(RequestId));
      expect(missing).toBeUndefined();
    });

    it('should check if keys exist in parent or child', () => {
      const parentModule = new ModuleDef()
        .make(Config).from().value(new Config('parent'));

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(Config)]);

      const subcontextModule = new ModuleDef()
        .make(RequestId).from().value(new RequestId('req-1'));

      const subcontext = createSubcontext(
        parentLocator,
        subcontextModule,
        [DIKey.of(RequestId)],
      );

      // Should find both parent and child bindings
      expect(subcontext.has(DIKey.of(Config))).toBe(true);
      expect(subcontext.has(DIKey.of(RequestId))).toBe(true);

      // Should not find non-existent binding
      expect(subcontext.has(DIKey.of(ParentService))).toBe(false);
    });
  });

  describe('Nested Subcontexts', () => {
    @Injectable()
    class Level1 {
      constructor(public readonly value: string) {}
    }

    @Injectable()
    class Level2 {
      constructor(public readonly value: string) {}
    }

    @Injectable()
    class Level3 {
      constructor(public readonly value: string) {}
    }

    @Injectable()
    class Service {
      constructor(
        public readonly l1: Level1,
        public readonly l2: Level2,
        public readonly l3: Level3,
      ) {}
    }

    it('should support nested subcontexts', () => {
      // Level 1 (root)
      const rootModule = new ModuleDef()
        .make(Level1).from().value(new Level1('root'));

      const injector = new Injector();
      const rootLocator = injector.produce(rootModule, [DIKey.of(Level1)]);

      // Level 2 (child of root)
      const level2Module = new ModuleDef()
        .make(Level2).from().value(new Level2('level2'));

      const level2Context = createSubcontext(
        rootLocator,
        level2Module,
        [DIKey.of(Level2)],
      );

      // Level 3 (child of level2)
      const level3Module = new ModuleDef()
        .make(Level3).from().value(new Level3('level3'))
        .make(Service).from().type(Service);

      const level3Context = createSubcontext(
        level2Context,
        level3Module,
        [DIKey.of(Level3), DIKey.of(Service)],
      );

      // Should be able to access all levels
      const service = level3Context.get(DIKey.of(Service));
      expect(service.l1.value).toBe('root');
      expect(service.l2.value).toBe('level2');
      expect(service.l3.value).toBe('level3');
    });
  });

  describe('Set Bindings in Subcontext', () => {
    @Injectable()
    abstract class Plugin {
      abstract getName(): string;
    }

    @Injectable()
    class ParentPlugin extends Plugin {
      getName(): string {
        return 'parent-plugin';
      }
    }

    @Injectable()
    class ChildPlugin extends Plugin {
      getName(): string {
        return 'child-plugin';
      }
    }

    it('should merge sets from parent and child', () => {
      const parentModule = new ModuleDef()
        .many(Plugin).from().type(ParentPlugin);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.set(Plugin as any)]);

      const childModule = new ModuleDef()
        .many(Plugin).from().type(ChildPlugin);

      const subcontext = createSubcontext(
        parentLocator,
        childModule,
        [DIKey.set(Plugin as any)],
      );

      // Should contain plugins from both parent and child
      const plugins = subcontext.getSet(Plugin as any);
      expect(plugins.size).toBe(2);

      const names = Array.from(plugins).map(p => p.getName()).sort();
      expect(names).toEqual(['child-plugin', 'parent-plugin']);
    });

    it('should handle sets that only exist in child', () => {
      const parentModule = new ModuleDef()
        .make(ParentPlugin).from().type(ParentPlugin);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(ParentPlugin)]);

      const childModule = new ModuleDef()
        .many(Plugin).from().type(ChildPlugin);

      const subcontext = createSubcontext(
        parentLocator,
        childModule,
        [DIKey.set(Plugin as any)],
      );

      // Should only contain child plugins
      const plugins = subcontext.getSet(Plugin as any);
      expect(plugins.size).toBe(1);
      expect(Array.from(plugins)[0]).toBeInstanceOf(ChildPlugin);
    });
  });

  describe('Real-world Example: Web Request Handling', () => {
    // Application-level services
    @Injectable()
    class AppConfig {
      constructor(public readonly port: number) {}
    }

    @Injectable()
    class DatabaseConnection {
      query(sql: string): string {
        return `Result: ${sql}`;
      }
    }

    @Injectable()
    class UserRepository {
      constructor(private readonly db: DatabaseConnection) {}

      findUser(id: string): any {
        return { id, name: 'User ' + id };
      }
    }

    // Request-level services
    @Injectable()
    class RequestContext {
      constructor(
        public readonly requestId: string,
        public readonly userId: string,
      ) {}
    }

    @Injectable()
    class CurrentUser {
      constructor(
        private readonly ctx: RequestContext,
        private readonly userRepo: UserRepository,
      ) {}

      getUser() {
        return this.userRepo.findUser(this.ctx.userId);
      }
    }

    @Injectable()
    class RequestHandler {
      constructor(
        private readonly currentUser: CurrentUser,
        private readonly ctx: RequestContext,
      ) {}

      handle(): any {
        return {
          requestId: this.ctx.requestId,
          user: this.currentUser.getUser(),
        };
      }
    }

    it('should handle request-scoped dependencies', () => {
      // Application-level module (singleton scope)
      const appModule = new ModuleDef()
        .make(AppConfig).from().value(new AppConfig(3000))
        .make(DatabaseConnection).from().type(DatabaseConnection)
        .make(UserRepository).from().type(UserRepository);

      const injector = new Injector();
      const appLocator = injector.produce(appModule, [
        DIKey.of(AppConfig),
        DIKey.of(DatabaseConnection),
        DIKey.of(UserRepository),
      ]);

      // Request 1
      const request1Module = new ModuleDef()
        .make(RequestContext).from().value(new RequestContext('req-1', 'user-123'))
        .make(CurrentUser).from().type(CurrentUser)
        .make(RequestHandler).from().type(RequestHandler);

      const request1Context = createSubcontext(
        appLocator,
        request1Module,
        [DIKey.of(RequestHandler)],
      );

      const result1 = request1Context.get(DIKey.of(RequestHandler)).handle();
      expect(result1.requestId).toBe('req-1');
      expect(result1.user.id).toBe('user-123');

      // Request 2 (different request ID and user)
      const request2Module = new ModuleDef()
        .make(RequestContext).from().value(new RequestContext('req-2', 'user-456'))
        .make(CurrentUser).from().type(CurrentUser)
        .make(RequestHandler).from().type(RequestHandler);

      const request2Context = createSubcontext(
        appLocator,
        request2Module,
        [DIKey.of(RequestHandler)],
      );

      const result2 = request2Context.get(DIKey.of(RequestHandler)).handle();
      expect(result2.requestId).toBe('req-2');
      expect(result2.user.id).toBe('user-456');

      // Both requests should share the same app-level instances
      expect(request1Context.get(DIKey.of(AppConfig))).toBe(
        request2Context.get(DIKey.of(AppConfig))
      );
    });
  });

  describe('Subcontext Lifecycle', () => {
    it('should close subcontext resources without affecting parent', async () => {
      const parentClosed: string[] = [];
      const childClosed: string[] = [];

      @Injectable()
      class ParentService {
        constructor() {
          // Mark for cleanup
        }
      }

      @Injectable()
      class ChildService {
        constructor() {
          // Mark for cleanup
        }
      }

      const parentModule = new ModuleDef()
        .make(ParentService).from().type(ParentService);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(ParentService)]);

      const childModule = new ModuleDef()
        .make(ChildService).from().type(ChildService);

      const subcontext = createSubcontext(
        parentLocator,
        childModule,
        [DIKey.of(ChildService)],
      );

      // Close subcontext
      await subcontext.close();

      // Parent should still be accessible
      expect(() => parentLocator.get(DIKey.of(ParentService))).not.toThrow();
    });
  });

  describe('Subcontext with getByType methods', () => {
    @Injectable()
    class Config {
      value = 'config';
    }

    it('should support getByType', () => {
      const parentModule = new ModuleDef()
        .make(Config).from().type(Config);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.of(Config)]);

      const subcontext = createSubcontext(parentLocator, new ModuleDef(), []);

      const config = subcontext.getByType(Config);
      expect(config.value).toBe('config');
    });

    it('should support getByTypeAndId', () => {
      const parentModule = new ModuleDef()
        .make(Config).named('test').from().type(Config);

      const injector = new Injector();
      const parentLocator = injector.produce(parentModule, [DIKey.named(Config, 'test')]);

      const subcontext = createSubcontext(parentLocator, new ModuleDef(), []);

      const config = subcontext.getByTypeAndId(Config, 'test');
      expect(config.value).toBe('config');
    });
  });
});
