# Veritas API Documentation

## Overview

The Veritas API provides programmatic access to truth analysis capabilities, including content analysis, pattern detection, and reality deviation measurements.

## API Versions

- Current Version: v1
- Base URL: `https://api.veritas-project.com/v1`

## Authentication

All API requests require authentication using an API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.veritas-project.com/v1/
```

## API Endpoints

### Content Analysis

#### Analyze Content
```http
POST /content/analyze
```

Analyzes content for truth deviation and patterns.

#### Get Content Analysis
```http
GET /content/{id}/analysis
```

Retrieves analysis results for specific content.

### Pattern Detection

#### Detect Patterns
```http
POST /patterns/detect
```

Detects patterns in content propagation.

#### Get Pattern Details
```http
GET /patterns/{id}
```

Retrieves details about a specific pattern.

### Source Management

#### Create Source
```http
POST /sources
```

Registers a new information source.

#### Update Source
```http
PUT /sources/{id}
```

Updates source information.

### Reality Deviation

#### Measure Deviation
```http
POST /deviation/measure
```

Measures reality deviation for content.

#### Get Deviation Metrics
```http
GET /deviation/{id}/metrics
```

Retrieves deviation metrics.

## GraphQL API

Veritas also provides a GraphQL API for more flexible queries:

```graphql
query {
  content(id: "123") {
    analysis {
      deviationMetrics {
        baselineScore
        deviationMagnitude
        propagationVelocity
      }
      patterns {
        type
        confidence
      }
    }
  }
}
```

## Rate Limiting

- 1000 requests per hour for authenticated users
- 100 requests per hour for unauthenticated users

## Error Handling

The API uses standard HTTP status codes and returns detailed error messages:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid content format",
    "details": {
      "field": "content.text",
      "reason": "exceeds maximum length"
    }
  }
}
```

## SDKs and Libraries

- [Node.js SDK](https://github.com/oneirocom/veritas-node)
- [Python SDK](https://github.com/oneirocom/veritas-python)
- [Go SDK](https://github.com/oneirocom/veritas-go)

## Examples

### Node.js
```javascript
const { VeritasClient } = require('@veritas/node');

const client = new VeritasClient('YOUR_API_KEY');

async function analyzeContent(text) {
  const analysis = await client.content.analyze({ text });
  console.log(analysis.deviationMetrics);
}
```

### Python
```python
from veritas import VeritasClient

client = VeritasClient('YOUR_API_KEY')

def analyze_content(text):
    analysis = client.content.analyze(text=text)
    print(analysis.deviation_metrics)
```

## Webhooks

Subscribe to real-time updates:

```http
POST /webhooks
Content-Type: application/json

{
  "url": "https://your-domain.com/webhook",
  "events": ["pattern.detected", "deviation.high"]
}
```

## Support

- [API Status](https://status.veritas-project.com)
- [Developer Forum](https://forum.veritas-project.com)
- Email: api@veritas-project.com 