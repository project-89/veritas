# Content Classification Module

This module provides content analysis and classification capabilities for the Veritas platform.

## Features

- **Content Classification**: Analyze and classify content using NLP techniques
- **Content Service**: Manage content creation, retrieval, and searching
- **Content Validation**: Validate content inputs and updates

## Usage

### Module Import

```typescript
import { ContentClassificationModule } from '@veritas/content-classification';

@Module({
  imports: [
    ContentClassificationModule.forRoot({
      databaseProvider: YourDatabaseService 
    })
  ]
})
export class AppModule {}
```

### Content Classification Service

```typescript
import { ContentClassificationService, ContentClassification } from '@veritas/content-classification';

@Injectable()
export class YourService {
  constructor(private readonly classificationService: ContentClassificationService) {}

  async analyzeText(text: string): Promise<ContentClassification> {
    return this.classificationService.classifyContent(text);
  }
}
```

### Content Service

```typescript
import { ContentService, ContentCreateInput } from '@veritas/content-classification';

@Injectable()
export class YourService {
  constructor(private readonly contentService: ContentService) {}

  async createContent(data: ContentCreateInput) {
    return this.contentService.createContent(data);
  }
}
```

## Migration Note

This module consolidates functionality previously spread across both `@veritas/content-classification` and `@veritas/content-classification`. The `@veritas/content-classification` module is now deprecated and will be removed in a future release.

If you were previously using `@veritas/content-classification`, update your imports to use `@veritas/content-classification` instead. 