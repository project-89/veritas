import { Test } from '@nestjs/testing';
import { DATABASE_PROVIDER } from '../src/lib/database.constants';
import { DatabaseService } from '../src/lib/database.service';
import { DatabaseProvider } from '../src/lib/interfaces/database-provider.interface';
import { Repository } from '../src/lib/interfaces/repository.interface';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockProvider: jest.Mocked<DatabaseProvider>;
  let mockRepository: jest.Mocked<Repository<any>>;

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      updateById: jest.fn(),
      updateMany: jest.fn(),
      deleteById: jest.fn(),
      deleteMany: jest.fn(),
    };

    mockProvider = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(false),
      registerModel: jest.fn().mockReturnValue({}),
      getRepository: jest.fn().mockReturnValue(mockRepository),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [DatabaseService, { provide: DATABASE_PROVIDER, useValue: mockProvider }],
    }).compile();

    service = moduleRef.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to the database and set initialized to true', async () => {
      await service.onModuleInit();

      expect(mockProvider.connect).toHaveBeenCalled();
      expect((service as any).initialized).toBe(true);
    });

    it('should not call connect if already connected', async () => {
      mockProvider.isConnected.mockReturnValue(true);

      await service.onModuleInit();

      expect(mockProvider.connect).not.toHaveBeenCalled();
      expect((service as any).initialized).toBe(true);
    });

    it('should propagate errors from provider.connect', async () => {
      mockProvider.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from the database when connected', async () => {
      mockProvider.isConnected.mockReturnValue(true);

      await service.onModuleDestroy();

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should not disconnect if not connected', async () => {
      mockProvider.isConnected.mockReturnValue(false);

      await service.onModuleDestroy();

      expect(mockProvider.disconnect).not.toHaveBeenCalled();
    });

    it('should propagate errors from provider.disconnect', async () => {
      mockProvider.isConnected.mockReturnValue(true);
      mockProvider.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(service.onModuleDestroy()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('connect', () => {
    it('should call provider.connect when not connected', async () => {
      mockProvider.isConnected.mockReturnValue(false);

      await service.connect();

      expect(mockProvider.connect).toHaveBeenCalled();
    });

    it('should not call provider.connect when already connected', async () => {
      mockProvider.isConnected.mockReturnValue(true);

      await service.connect();

      expect(mockProvider.connect).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should call provider.disconnect when connected', async () => {
      mockProvider.isConnected.mockReturnValue(true);

      await service.disconnect();

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should not call provider.disconnect when not connected', async () => {
      mockProvider.isConnected.mockReturnValue(false);

      await service.disconnect();

      expect(mockProvider.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when provider is connected', () => {
      mockProvider.isConnected.mockReturnValue(true);

      expect(service.isConnected()).toBe(true);
    });

    it('should return false when provider is not connected', () => {
      mockProvider.isConnected.mockReturnValue(false);

      expect(service.isConnected()).toBe(false);
    });
  });

  describe('getRepository', () => {
    it('should return a repository when initialized', async () => {
      // Initialize the service first
      await service.onModuleInit();

      const repo = service.getRepository('TestEntity');

      expect(mockProvider.getRepository).toHaveBeenCalledWith('TestEntity');
      expect(repo).toBe(mockRepository);
    });

    it('should throw an error when not initialized', () => {
      expect(() => service.getRepository('TestEntity')).toThrow(
        'Database service is not initialized',
      );
    });

    it('should propagate errors from provider.getRepository', async () => {
      await service.onModuleInit();
      mockProvider.getRepository.mockImplementation(() => {
        throw new Error('Model not registered');
      });

      expect(() => service.getRepository('Unknown')).toThrow('Model not registered');
    });
  });

  describe('registerModel', () => {
    it('should register a model when initialized', async () => {
      await service.onModuleInit();
      const mockSchema = { fields: {} };

      const result = service.registerModel('TestModel', mockSchema);

      expect(mockProvider.registerModel).toHaveBeenCalledWith('TestModel', mockSchema);
      expect(result).toEqual({});
    });

    it('should throw an error when not initialized', () => {
      expect(() => service.registerModel('TestModel', {})).toThrow(
        'Database service is not initialized',
      );
    });

    it('should propagate errors from provider.registerModel', async () => {
      await service.onModuleInit();
      mockProvider.registerModel.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      expect(() => service.registerModel('TestModel', {})).toThrow('Registration failed');
    });
  });
});
