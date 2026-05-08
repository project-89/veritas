/**
 * Mock implementation of class-validator for testing purposes.
 */

type ValidationTarget = Record<string, unknown> & {
  constructor: { name: string };
  engagementMetrics?: ValidationTarget;
};

type ValidationError = {
  property: string;
  constraints: Record<string, string>;
  value?: unknown;
};

type ValidationRule =
  | { type: 'isNotEmpty'; message: string }
  | { type: 'min'; value: number; message: string }
  | { type: 'max'; value: number; message: string }
  | { type: 'isEnum'; enum: string[]; message: string }
  | { type: 'nested'; message: string };

type ValidationMetadata = Record<string, ValidationRule[]>;

type ValidationOptions = {
  validationError?: {
    target?: boolean;
  };
};

type MockPropertyDecorator = (target: object, propertyKey: string | symbol) => void;

function createDecorator(): MockPropertyDecorator {
  return (target, propertyKey) => {
    void target;
    void propertyKey;
  };
}

export async function validate(
  object: ValidationTarget,
  options?: ValidationOptions,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  const metadata = getValidationMetadata(object);

  for (const [property, rules] of Object.entries(metadata)) {
    for (const rule of rules) {
      const value = object[property];
      if (validateRule(rule, value)) {
        continue;
      }

      errors.push({
        property,
        constraints: { [rule.type]: rule.message },
        value: options?.validationError?.target === false ? undefined : value,
      });
      break;
    }
  }

  return errors;
}

function getValidationMetadata(object: ValidationTarget): ValidationMetadata {
  const metadata: ValidationMetadata = {};

  if (object.constructor.name === 'EngagementMetricsInput') {
    metadata.likes = [{ type: 'min', value: 0, message: 'likes must be at least 0' }];
    metadata.viralityScore = [
      { type: 'min', value: 0, message: 'viralityScore must be at least 0' },
      { type: 'max', value: 1, message: 'viralityScore must not be greater than 1' },
    ];
  }

  if (object.constructor.name === 'ContentIngestionInput') {
    metadata.text = [{ type: 'isNotEmpty', message: 'text should not be empty' }];
    metadata.platform = [
      {
        type: 'isEnum',
        enum: ['twitter', 'facebook', 'reddit', 'other'],
        message: 'platform must be a valid platform',
      },
    ];

    if (object.engagementMetrics) {
      void validate(object.engagementMetrics).then((engagementErrors) => {
        if (engagementErrors.length > 0) {
          metadata.engagementMetrics = [{ type: 'nested', message: 'Invalid engagement metrics' }];
        }
      });
    }
  }

  if (object.constructor.name === 'SourceIngestionInput') {
    metadata.name = [{ type: 'isNotEmpty', message: 'name should not be empty' }];
    metadata.platform = [
      {
        type: 'isEnum',
        enum: ['twitter', 'facebook', 'reddit', 'other'],
        message: 'platform must be a valid platform',
      },
    ];
    metadata.credibilityScore = [
      { type: 'min', value: 0, message: 'credibilityScore must be at least 0' },
      { type: 'max', value: 1, message: 'credibilityScore must not be greater than 1' },
    ];
    metadata.verificationStatus = [
      {
        type: 'isEnum',
        enum: ['verified', 'unverified', 'suspicious'],
        message: 'verificationStatus must be valid',
      },
    ];
  }

  return metadata;
}

function validateRule(rule: ValidationRule, value: unknown): boolean {
  switch (rule.type) {
    case 'isNotEmpty':
      return value !== undefined && value !== null && value !== '';
    case 'min':
      return typeof value === 'number' && value >= rule.value;
    case 'max':
      return typeof value === 'number' && value <= rule.value;
    case 'isEnum':
      return rule.enum.includes(String(value));
    case 'nested':
      return true;
  }
}

export function IsString(): MockPropertyDecorator {
  return createDecorator();
}

export function IsEnum(entity: unknown): MockPropertyDecorator {
  void entity;
  return createDecorator();
}

export function IsNumber(): MockPropertyDecorator {
  return createDecorator();
}

export function Min(min: number): MockPropertyDecorator {
  void min;
  return createDecorator();
}

export function Max(max: number): MockPropertyDecorator {
  void max;
  return createDecorator();
}

export function IsOptional(): MockPropertyDecorator {
  return createDecorator();
}

export function IsObject(): MockPropertyDecorator {
  return createDecorator();
}

export function IsNotEmpty(): MockPropertyDecorator {
  return createDecorator();
}

export function ValidateNested(): MockPropertyDecorator {
  return createDecorator();
}
