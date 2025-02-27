import { Test, TestingModule } from "@nestjs/testing";
import { LoggingService } from "./logging.service";

describe("LoggingService", () => {
  let service: LoggingService;
  let consoleSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoggingService],
    }).compile();

    service = await module.resolve<LoggingService>(LoggingService);
    consoleSpy = jest.spyOn(console, "log").mockImplementation();
    errorSpy = jest.spyOn(console, "error").mockImplementation();
    warnSpy = jest.spyOn(console, "warn").mockImplementation();
    infoSpy = jest.spyOn(console, "info").mockImplementation();
    debugSpy = jest.spyOn(console, "debug").mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("log levels", () => {
    const testMessage = "Test message";
    const testContext = "test-context";

    it("should log messages with log level", () => {
      service.log(testMessage, testContext);
      expect(consoleSpy).toHaveBeenCalledWith(
        `[Log] [${testContext}] ${testMessage}`
      );
    });

    it("should log messages with error level", () => {
      service.error(testMessage, undefined, testContext);
      expect(errorSpy).toHaveBeenCalledWith(
        `[Error] [${testContext}] ${testMessage}`,
        ""
      );
    });

    it("should log messages with warn level", () => {
      service.warn(testMessage, testContext);
      expect(warnSpy).toHaveBeenCalledWith(
        `[Warn] [${testContext}] ${testMessage}`
      );
    });

    it("should log messages with info level", () => {
      service.info(testMessage, testContext);
      expect(infoSpy).toHaveBeenCalledWith(
        `[Info] [${testContext}] ${testMessage}`
      );
    });

    it("should log messages with debug level", () => {
      service.debug(testMessage, testContext);
      expect(debugSpy).toHaveBeenCalledWith(
        `[Debug] [${testContext}] ${testMessage}`
      );
    });

    it("should log messages with verbose level", () => {
      service.verbose(testMessage, testContext);
      expect(debugSpy).toHaveBeenCalledWith(
        `[Verbose] [${testContext}] ${testMessage}`
      );
    });
  });

  describe("context handling", () => {
    it("should handle undefined context", () => {
      service.log("Test message");
      expect(consoleSpy).toHaveBeenCalledWith(`[Log] [Global] Test message`);
    });

    it("should handle explicit undefined context", () => {
      service.log("Test message", undefined);
      expect(consoleSpy).toHaveBeenCalledWith(`[Log] [Global] Test message`);
    });

    it("should treat empty string context as undefined", () => {
      service.log("Test message", "");
      expect(consoleSpy).toHaveBeenCalledWith(`[Log] [Global] Test message`);
    });

    it("should handle context with special characters", () => {
      const specialContext = "test.context-123_[ABC]";
      service.log("Test message", specialContext);
      expect(consoleSpy).toHaveBeenCalledWith(
        `[Log] [${specialContext}] Test message`
      );
    });
  });

  describe("error handling", () => {
    it("should log error message with trace", () => {
      const errorMessage = "Test error";
      const errorTrace = "Error stack trace";
      service.error(errorMessage, errorTrace);
      expect(errorSpy).toHaveBeenCalledWith(
        `[Error] [Global] ${errorMessage}`,
        errorTrace
      );
    });

    it("should log error message with context", () => {
      const errorMessage = "Test error";
      const context = "error-context";
      service.error(errorMessage, undefined, context);
      expect(errorSpy).toHaveBeenCalledWith(
        `[Error] [${context}] ${errorMessage}`,
        ""
      );
    });

    it("should log error message with trace and context", () => {
      const errorMessage = "Test error";
      const errorTrace = "Error stack trace";
      const context = "error-context";
      service.error(errorMessage, errorTrace, context);
      expect(errorSpy).toHaveBeenCalledWith(
        `[Error] [${context}] ${errorMessage}`,
        errorTrace
      );
    });
  });

  describe("context setting", () => {
    it("should set and use context for subsequent logs", () => {
      const context = "persistent-context";
      service.setContext(context);

      service.log("Test message");
      expect(consoleSpy).toHaveBeenCalledWith(
        `[Log] [${context}] Test message`
      );
    });

    it("should override set context with provided context", () => {
      service.setContext("persistent-context");
      const overrideContext = "override-context";

      service.log("Test message", overrideContext);
      expect(consoleSpy).toHaveBeenCalledWith(
        `[Log] [${overrideContext}] Test message`
      );
    });
  });
});
