import { describe, it, expect } from 'vitest';
import { Injector, ModuleDef, DIKey, Axis, AxisPoint, Activation, Reflected } from '../src/distage';

// Test classes
abstract class MessageService {
  abstract send(msg: string): string;
}

class EmailService extends MessageService {
  send(msg: string): string {
    return `Email: ${msg}`;
  }
}

class SmsService extends MessageService {
  send(msg: string): string {
    return `SMS: ${msg}`;
  }
}

class PushService extends MessageService {
  send(msg: string): string {
    return `Push: ${msg}`;
  }
}

@Reflected(MessageService)
class NotificationManager {
  constructor(public readonly service: MessageService) {}
}

describe('Axis Tagging and Activation', () => {
  const NotificationChannel = Axis.of('NotificationChannel', ['Email', 'SMS', 'Push']);

  it('should select bindings based on activation', () => {
    const module = new ModuleDef()
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Email')
        .from().type(EmailService)
      .make(MessageService as any)
        .tagged(NotificationChannel, 'SMS')
        .from().type(SmsService)
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Push')
        .from().type(PushService)
      .make(NotificationManager).from().type(NotificationManager);

    const injector = new Injector();

    // Test Email activation
    const emailActivation = Activation.of(AxisPoint.of(NotificationChannel, 'Email'));
    const emailManager = injector.produceByType(module, NotificationManager, {
      activation: emailActivation,
    });
    expect(emailManager.service).toBeInstanceOf(EmailService);
    expect(emailManager.service.send('test')).toBe('Email: test');

    // Test SMS activation
    const smsActivation = Activation.of(AxisPoint.of(NotificationChannel, 'SMS'));
    const smsManager = injector.produceByType(module, NotificationManager, {
      activation: smsActivation,
    });
    expect(smsManager.service).toBeInstanceOf(SmsService);
    expect(smsManager.service.send('test')).toBe('SMS: test');

    // Test Push activation
    const pushActivation = Activation.of(AxisPoint.of(NotificationChannel, 'Push'));
    const pushManager = injector.produceByType(module, NotificationManager, {
      activation: pushActivation,
    });
    expect(pushManager.service).toBeInstanceOf(PushService);
    expect(pushManager.service.send('test')).toBe('Push: test');
  });

  it('should support default bindings without tags', () => {
    const module = new ModuleDef()
      .make(MessageService as any).from().type(EmailService) // Default
      .make(MessageService as any)
        .tagged(NotificationChannel, 'SMS')
        .from().type(SmsService)
      .make(NotificationManager).from().type(NotificationManager);

    const injector = new Injector();

    // Without activation, should use default
    const defaultManager = injector.produceByType(module, NotificationManager);
    expect(defaultManager.service).toBeInstanceOf(EmailService);

    // With SMS activation, should use SMS
    const smsActivation = Activation.of(AxisPoint.of(NotificationChannel, 'SMS'));
    const smsManager = injector.produceByType(module, NotificationManager, {
      activation: smsActivation,
    });
    expect(smsManager.service).toBeInstanceOf(SmsService);
  });

  it('should prefer more specific bindings', () => {
    const Environment = Axis.of('Environment', ['Dev', 'Prod']);

        class DevEmailService extends EmailService {
      send(msg: string): string {
        return `[DEV] Email: ${msg}`;
      }
    }

    const module = new ModuleDef()
      .make(MessageService as any).from().type(EmailService) // Default, no tags
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Email')
        .from().type(EmailService) // Tagged with channel only
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Email')
        .tagged(Environment, 'Dev')
        .from().type(DevEmailService) // Tagged with both channel and env
      .make(NotificationManager).from().type(NotificationManager);

    const injector = new Injector();

    // With both activations, should use the most specific (DevEmailService)
    const activation = Activation.of(
      AxisPoint.of(NotificationChannel, 'Email'),
      AxisPoint.of(Environment, 'Dev'),
    );
    const manager = injector.produceByType(module, NotificationManager, {
      activation,
    });

    expect(manager.service).toBeInstanceOf(DevEmailService);
    expect(manager.service.send('test')).toBe('[DEV] Email: test');
  });

  it('should throw on conflicting bindings with same specificity', () => {
    const module = new ModuleDef()
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Email')
        .from().type(EmailService)
      .make(MessageService as any)
        .tagged(NotificationChannel, 'Email')
        .from().type(PushService) // Same tag, different implementation
      .make(NotificationManager).from().type(NotificationManager);

    const injector = new Injector();
    const activation = Activation.of(AxisPoint.of(NotificationChannel, 'Email'));

    expect(() => {
      injector.produceByType(module, NotificationManager, { activation });
    }).toThrow(/Multiple bindings/);
  });
});
