/**
 * Mock implementation of class-validator for testing purposes
 */

// Mock validate function
export function validate(object: any, options?: any): Promise<any[]> {
  const errors: any[] = [];

  // Get class validation metadata
  const metadata = getValidationMetadata(object);

  // Validate properties based on metadata
  for (const [property, rules] of Object.entries(metadata)) {
    for (const rule of rules) {
      const value = object[property];

      // Apply validation rules
      const isValid = validateRule(rule, value, object);
      if (!isValid) {
        errors.push({
          property,
          constraints: { [rule.type]: rule.message },
          value: options?.validationError?.target === false ? undefined : value,
        });
        break; // Stop at first error for this property
      }
    }
  }

  return Promise.resolve(errors);
}

// Minimal metadata extraction from object
function getValidationMetadata(object: any): Record<string, any[]> {
  const metadata: Record<string, any[]> = {};

  // Process EngagementMetricsInput
  if (object.constructor.name === 'EngagementMetricsInput') {
    // Validate likes
    metadata.likes = [
      { type: 'min', value: 0, message: 'likes must be at least 0' },
    ];

    // Validate viralityScore
    metadata.viralityScore = [
      { type: 'min', value: 0, message: 'viralityScore must be at least 0' },
      {
        type: 'max',
        value: 1,
        message: 'viralityScore must not be greater than 1',
      },
    ];
  }

  // Process ContentIngestionInput
  if (object.constructor.name === 'ContentIngestionInput') {
    // Validate text
    metadata.text = [
      { type: 'isNotEmpty', message: 'text should not be empty' },
    ];

    // Validate platform
    metadata.platform = [
      {
        type: 'isEnum',
        enum: ['twitter', 'facebook', 'reddit', 'other'],
        message: 'platform must be a valid platform',
      },
    ];

    // Validate engagementMetrics
    if (object.engagementMetrics) {
      const engagementErrors = validate(object.engagementMetrics);
      if (engagementErrors instanceof Promise) {
        engagementErrors.then((errors) => {
          if (errors.length > 0) {
            metadata.engagementMetrics = [
              { type: 'nested', message: 'Invalid engagement metrics' },
            ];
          }
        });
      }
    }
  }

  // Process SourceIngestionInput
  if (object.constructor.name === 'SourceIngestionInput') {
    // Validate name
    metadata.name = [
      { type: 'isNotEmpty', message: 'name should not be empty' },
    ];

    // Validate platform
    metadata.platform = [
      {
        type: 'isEnum',
        enum: ['twitter', 'facebook', 'reddit', 'other'],
        message: 'platform must be a valid platform',
      },
    ];

    // Validate credibilityScore
    metadata.credibilityScore = [
      { type: 'min', value: 0, message: 'credibilityScore must be at least 0' },
      {
        type: 'max',
        value: 1,
        message: 'credibilityScore must not be greater than 1',
      },
    ];

    // Validate verificationStatus
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

// Validate a single rule against a value
function validateRule(rule: any, value: any, object: any): boolean {
  switch (rule.type) {
    case 'isNotEmpty':
      return value !== undefined && value !== null && value !== '';

    case 'min':
      return typeof value === 'number' && value >= rule.value;

    case 'max':
      return typeof value === 'number' && value <= rule.value;

    case 'isEnum':
      return rule.enum.includes(value);

    case 'nested':
      // This would be more complex in a real implementation
      return true;

    default:
      return true;
  }
}

// Mock decorators
export function IsString() {
  return function (target: any, propertyKey: string) {};
}

export function IsEnum(entity: any) {
  return function (target: any, propertyKey: string) {};
}

export function IsNumber() {
  return function (target: any, propertyKey: string) {};
}

export function Min(min: number) {
  return function (target: any, propertyKey: string) {};
}

export function Max(max: number) {
  return function (target: any, propertyKey: string) {};
}

export function IsOptional() {
  return function (target: any, propertyKey: string) {};
}

export function IsObject() {
  return function (target: any, propertyKey: string) {};
}

export function IsNotEmpty() {
  return function (target: any, propertyKey: string) {};
}

export function ValidateNested() {
  return function (target: any, propertyKey: string) {};
}
