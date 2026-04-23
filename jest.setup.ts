import { ConsoleLogger, Logger } from '@nestjs/common';

if (process.env['VERITAS_TEST_LOGS'] !== '1') {
  const noop = () => {};

  Logger.overrideLogger(false);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(noop);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(noop);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(noop);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(noop);
  jest.spyOn(Logger.prototype, 'verbose').mockImplementation(noop);
  jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(noop);
  jest.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(noop);
  jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(noop);
  jest.spyOn(ConsoleLogger.prototype, 'debug').mockImplementation(noop);
  jest.spyOn(ConsoleLogger.prototype, 'verbose').mockImplementation(noop);
}
