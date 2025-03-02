# Veritas API Documentation

This document provides information about the Veritas API endpoints, request/response formats, and authentication.

## Base URL

For local development: `http://localhost:4000/api`

## Authentication

The API uses JWT (JSON Web Token) for authentication.

### Obtaining a Token

```
POST /auth/login
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Using the Token

Include the token in the Authorization header for protected endpoints:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## API Endpoints

### Sources

#### List Sources

```
GET /sources
```

**Query Parameters:**

- `platform` (optional): Filter by platform (e.g., 'twitter', 'reddit')
- `verified` (optional): Filter by verification status (true/false)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)

**Response:**

```json
{
  "data": [
    {
      "id": "source-123",
      "type": "source",
      "name": "Example News",
      "platform": "news",
      "url": "https://example.com",
      "verified": true,
      "credibilityScore": 0.85,
      "followerCount": null,
      "description": "A news source example",
      "profileImageUrl": "https://example.com/profile.jpg",
      "createdAt": "2023-01-15T12:00:00Z",
      "verificationStatus": "verified"
    },
    // More sources...
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

#### Get Source

```
GET /sources/:id
```

**Response:**

```json
{
  "data": {
    "id": "source-123",
    "type": "source",
    "name": "Example News",
    "platform": "news",
    "url": "https://example.com",
    "verified": true,
    "credibilityScore": 0.85,
    "followerCount": null,
    "description": "A news source example",
    "profileImageUrl": "https://example.com/profile.jpg",
    "createdAt": "2023-01-15T12:00:00Z",
    "verificationStatus": "verified",
    "metadata": {
      "location": "New York, NY",
      "joinDate": "2020-03-15T00:00:00Z"
    }
  }
}
```

#### Create Source

```
POST /sources
```

**Request Body:**

```json
{
  "name": "New Source",
  "platform": "twitter",
  "url": "https://twitter.com/newsource",
  "verified": false,
  "credibilityScore": 0.7,
  "description": "A new source for testing",
  "profileImageUrl": "https://example.com/profile.jpg",
  "verificationStatus": "unverified"
}
```

**Response:**

```json
{
  "data": {
    "id": "source-456",
    "type": "source",
    "name": "New Source",
    "platform": "twitter",
    "url": "https://twitter.com/newsource",
    "verified": false,
    "credibilityScore": 0.7,
    "description": "A new source for testing",
    "profileImageUrl": "https://example.com/profile.jpg",
    "createdAt": "2023-06-20T14:30:00Z",
    "verificationStatus": "unverified"
  }
}
```

#### Update Source

```
PUT /sources/:id
```

**Request Body:**

```json
{
  "verified": true,
  "credibilityScore": 0.8,
  "verificationStatus": "verified"
}
```

**Response:**

```json
{
  "data": {
    "id": "source-456",
    "type": "source",
    "name": "New Source",
    "platform": "twitter",
    "url": "https://twitter.com/newsource",
    "verified": true,
    "credibilityScore": 0.8,
    "description": "A new source for testing",
    "profileImageUrl": "https://example.com/profile.jpg",
    "createdAt": "2023-06-20T14:30:00Z",
    "verificationStatus": "verified"
  }
}
```

#### Delete Source

```
DELETE /sources/:id
```

**Response:**

```json
{
  "success": true,
  "message": "Source deleted successfully"
}
```

### Content

#### List Content

```
GET /content
```

**Query Parameters:**

- `sourceId` (optional): Filter by source ID
- `contentType` (optional): Filter by content type (e.g., 'post', 'article')
- `startDate` (optional): Filter by publish date (ISO date string)
- `endDate` (optional): Filter by publish date (ISO date string)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)

**Response:**

```json
{
  "data": [
    {
      "id": "content-789",
      "type": "content",
      "contentType": "post",
      "text": "This is a sample post about technology.",
      "sourceId": "source-123",
      "url": "https://example.com/post-1",
      "publishedAt": "2023-06-15T10:30:00Z",
      "engagementMetrics": {
        "likes": 150,
        "shares": 45,
        "comments": 23
      },
      "sentiment": 0.3,
      "topics": ["technology", "innovation"]
    },
    // More content...
  ],
  "meta": {
    "total": 1250,
    "page": 1,
    "limit": 20,
    "pages": 63
  }
}
```

#### Get Content

```
GET /content/:id
```

**Response:**

```json
{
  "data": {
    "id": "content-789",
    "type": "content",
    "contentType": "post",
    "text": "This is a sample post about technology.",
    "sourceId": "source-123",
    "url": "https://example.com/post-1",
    "publishedAt": "2023-06-15T10:30:00Z",
    "engagementMetrics": {
      "likes": 150,
      "shares": 45,
      "comments": 23
    },
    "sentiment": 0.3,
    "entities": [
      {
        "name": "Apple",
        "type": "organization",
        "sentiment": 0.5
      },
      {
        "name": "Tim Cook",
        "type": "person",
        "sentiment": 0.2
      }
    ],
    "topics": ["technology", "innovation"],
    "metadata": {
      "language": "en",
      "isOriginal": true,
      "containsMedia": false
    }
  }
}
```

#### Create Content

```
POST /content
```

**Request Body:**

```json
{
  "contentType": "article",
  "text": "This is a new article about climate change.",
  "sourceId": "source-123",
  "url": "https://example.com/article-2",
  "publishedAt": "2023-06-18T09:45:00Z"
}
```

**Response:**

```json
{
  "data": {
    "id": "content-790",
    "type": "content",
    "contentType": "article",
    "text": "This is a new article about climate change.",
    "sourceId": "source-123",
    "url": "https://example.com/article-2",
    "publishedAt": "2023-06-18T09:45:00Z",
    "createdAt": "2023-06-20T15:30:00Z"
  }
}
```

### Narratives

#### List Narratives

```
GET /narratives
```

**Query Parameters:**

- `topic` (optional): Filter by topic
- `minStrength` (optional): Filter by minimum strength (0.0-1.0)
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)

**Response:**

```json
{
  "data": [
    {
      "id": "narrative-456",
      "type": "narrative",
      "title": "Climate Change Impact",
      "description": "Narrative about climate change impacts on ecosystems",
      "createdAt": "2023-05-10T08:00:00Z",
      "updatedAt": "2023-06-18T14:20:00Z",
      "strength": 0.85,
      "topics": ["climate", "environment", "science"],
      "sentiment": -0.2,
      "contentCount": 45,
      "sourceCount": 12
    },
    // More narratives...
  ],
  "meta": {
    "total": 35,
    "page": 1,
    "limit": 20,
    "pages": 2
  }
}
```

#### Get Narrative

```
GET /narratives/:id
```

**Response:**

```json
{
  "data": {
    "id": "narrative-456",
    "type": "narrative",
    "title": "Climate Change Impact",
    "description": "Narrative about climate change impacts on ecosystems",
    "createdAt": "2023-05-10T08:00:00Z",
    "updatedAt": "2023-06-18T14:20:00Z",
    "strength": 0.85,
    "topics": ["climate", "environment", "science"],
    "sentiment": -0.2,
    "contentCount": 45,
    "sourceCount": 12,
    "metadata": {
      "status": "active",
      "visibility": 0.92
    }
  }
}
```

#### Get Narrative Branches

```
GET /narratives/:id/branches
```

**Response:**

```json
{
  "data": [
    {
      "id": "branch-789",
      "type": "branch",
      "narrativeId": "narrative-456",
      "title": "Climate Change Denial",
      "description": "Branch focusing on climate change denial arguments",
      "createdAt": "2023-05-15T10:30:00Z",
      "divergencePoint": "2023-05-12T18:45:00Z",
      "strength": 0.4,
      "topics": ["climate", "politics"],
      "sentiment": 0.1,
      "contentCount": 15,
      "sourceCount": 5
    },
    // More branches...
  ]
}
```

#### Get Narrative Content

```
GET /narratives/:id/content
```

**Query Parameters:**

- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of items per page (default: 20)

**Response:**

```json
{
  "data": [
    {
      "id": "content-123",
      "type": "content",
      "contentType": "article",
      "text": "Climate change is affecting coral reefs worldwide...",
      "sourceId": "source-456",
      "url": "https://example.com/article-3",
      "publishedAt": "2023-05-11T09:30:00Z",
      "strength": 0.75  // Strength of contribution to the narrative
    },
    // More content...
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

#### Get Narrative Flow Data

```
GET /narratives/:id/flow
```

**Query Parameters:**

- `startDate` (optional): Start date for the flow data (ISO date string)
- `endDate` (optional): End date for the flow data (ISO date string)
- `resolution` (optional): Time resolution ('day', 'week', 'month', default: 'day')

**Response:**

```json
{
  "data": {
    "id": "narrative-456",
    "title": "Climate Change Impact",
    "description": "Narrative about climate change impacts on ecosystems",
    "timeRange": ["2023-05-10T00:00:00Z", "2023-06-20T00:00:00Z"],
    "consensusBand": {
      "points": [
        {
          "date": "2023-05-10T00:00:00Z",
          "value": 0.5,
          "strength": 0.6,
          "contentCount": 3
        },
        // More points...
      ],
      "upperBound": [
        // Upper bound points...
      ],
      "lowerBound": [
        // Lower bound points...
      ],
      "strength": 0.85
    },
    "branches": [
      {
        "id": "branch-789",
        "title": "Climate Change Denial",
        "divergencePoint": "2023-05-12T18:45:00Z",
        "points": [
          {
            "date": "2023-05-12T00:00:00Z",
            "value": 0.6,
            "strength": 0.3,
            "contentCount": 1
          },
          // More points...
        ],
        "strength": 0.4,
        "sentiment": 0.1
      },
      // More branches...
    ],
    "connections": [
      {
        "source": "branch-789",
        "target": "branch-790",
        "strength": 0.3,
        "type": "related"
      },
      // More connections...
    ],
    "events": [
      {
        "id": "event-123",
        "date": "2023-05-15T00:00:00Z",
        "title": "Major Scientific Report Released",
        "description": "IPCC released a new report on climate change impacts",
        "importance": 0.8
      },
      // More events...
    ]
  }
}
```

### Analysis

#### Analyze Content

```
POST /analysis/content
```

**Request Body:**

```json
{
  "text": "This is a sample text to analyze for sentiment, entities, and topics."
}
```

**Response:**

```json
{
  "data": {
    "sentiment": 0.2,
    "entities": [
      {
        "name": "sentiment",
        "type": "concept",
        "sentiment": 0.1
      },
      {
        "name": "entities",
        "type": "concept",
        "sentiment": 0.3
      },
      {
        "name": "topics",
        "type": "concept",
        "sentiment": 0.2
      }
    ],
    "topics": ["analysis", "nlp"],
    "language": "en"
  }
}
```

#### Detect Narratives

```
POST /analysis/detect-narratives
```

**Request Body:**

```json
{
  "contentIds": ["content-123", "content-124", "content-125"],
  "threshold": 0.7
}
```

**Response:**

```json
{
  "data": {
    "narratives": [
      {
        "id": "narrative-789",
        "title": "Auto-generated Narrative Title",
        "description": "Automatically generated description based on content",
        "strength": 0.75,
        "topics": ["detected", "topics"],
        "contentIds": ["content-123", "content-124"]
      }
    ],
    "unclassified": ["content-125"]
  }
}
```

### System

#### Health Check

```
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "cache": "ok",
    "messageQueue": "ok"
  },
  "uptime": 86400
}
```

#### System Status

```
GET /system/status
```

**Response:**

```json
{
  "data": {
    "services": {
      "api": {
        "status": "running",
        "version": "1.0.0",
        "uptime": 86400
      },
      "ingestion": {
        "status": "running",
        "activeConnectors": ["twitter", "reddit", "news"],
        "queueSize": 15
      },
      "analysis": {
        "status": "running",
        "activeWorkers": 3,
        "queueSize": 8
      },
      "database": {
        "status": "running",
        "connections": 12,
        "size": "1.2GB"
      },
      "cache": {
        "status": "running",
        "hitRate": 0.85,
        "size": "256MB"
      }
    },
    "metrics": {
      "contentIngested": {
        "today": 1250,
        "total": 1250000
      },
      "narrativesDetected": {
        "today": 5,
        "total": 1500
      },
      "apiRequests": {
        "today": 15000,
        "avgResponseTime": 120
      }
    }
  }
}
```

#### Control Service

```
POST /system/services/:service/control
```

**Request Body:**

```json
{
  "action": "restart"  // "start", "stop", "restart"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Service 'ingestion' is restarting",
  "status": "restarting"
}
```

## Error Handling

The API uses standard HTTP status codes and returns error details in the response body:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "name",
        "message": "Name is required"
      }
    ]
  }
}
```

Common error codes:

- `VALIDATION_ERROR`: Invalid input data
- `NOT_FOUND`: Resource not found
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Permission denied
- `INTERNAL_ERROR`: Server error

## Rate Limiting

The API implements rate limiting to prevent abuse:

- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1623456789
```

When the rate limit is exceeded, the API returns a 429 Too Many Requests status code. 