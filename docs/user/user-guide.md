# Veritas User Guide

**Status: Current**  
**Last Updated: [Current Date]**

This comprehensive guide provides detailed information on using the Veritas system for narrative tracking and analysis.

## Table of Contents

1. [Introduction](#introduction)
2. [Data Privacy and Security](#data-privacy-and-security)
3. [User Interface](#user-interface)
4. [Account Management](#account-management)
5. [Source Configuration](#source-configuration)
6. [Content Management](#content-management)
7. [Narrative Analysis](#narrative-analysis)
8. [Visualization Tools](#visualization-tools)
9. [Search and Filtering](#search-and-filtering)
10. [Reports and Exports](#reports-and-exports)
11. [Collaboration Features](#collaboration-features)
12. [Notifications and Alerts](#notifications-and-alerts)
13. [Advanced Features](#advanced-features)
14. [Troubleshooting](#troubleshooting)
15. [Glossary](#glossary)

## Introduction

Veritas is a powerful system for tracking and analyzing narratives across digital platforms. It helps users understand how information flows, evolves, and influences perception by providing sophisticated visualization and analysis tools.

### Key Concepts

- **Source**: A platform or channel from which content is collected (e.g., Twitter, news sites, blogs)
- **Content**: Individual pieces of information (e.g., posts, articles, comments)
- **Narrative**: A cohesive story or theme that emerges from related content
- **Branch**: A divergent path that a narrative takes as it evolves
- **Consensus**: Areas where multiple narratives converge on similar points
- **Anonymized Insights**: Privacy-preserving data points that represent patterns without exposing identifiable information

## Data Privacy and Security

Veritas is designed with privacy and security as core principles. The system implements a transform-on-ingest architecture that ensures raw social media data is never stored.

### Transform-on-Ingest Architecture

When you use Veritas to analyze content from social media platforms:

1. **Immediate Transformation**: All incoming data is immediately transformed into anonymized insights
2. **No Raw Data Storage**: The original identifiable content is never stored in the system
3. **Privacy Preservation**: Only anonymized, non-identifiable insights are saved

### Benefits for Users

This architecture provides several key benefits:

1. **Enhanced Compliance**: Reduced concerns about platform terms of service violations
2. **Simplified Data Management**: No need to manage or delete raw social media content
3. **Focus on Patterns**: The system emphasizes narrative patterns rather than individual content items
4. **Reduced Privacy Risk**: Analysis can proceed with minimal privacy concerns

### What This Means for Your Analysis

- You'll see statistical and pattern-based information rather than raw content in some views
- Trends and narrative evolution are preserved while individual identities are protected
- The system may use terms like "Source Identifier" rather than usernames in certain contexts

## User Interface

### Dashboard

The dashboard is your starting point in Veritas, providing:

- **Overview Metrics**: Total sources, content items, and detected narratives
- **Recent Activity**: Latest narratives and content
- **System Status**: Health of data collection and analysis processes
- **Saved Views**: Quick access to your saved analyses and reports
- **Notifications**: Alerts about system events or narrative developments

### Navigation

The main navigation menu includes:

- **Dashboard**: Home screen with overview information
- **Sources**: Source management and configuration
- **Content**: Content explorer and management
- **Narratives**: Narrative analysis and visualization
- **Reports**: Report creation and management
- **Admin**: Administrative functions (if you have permissions)
- **Settings**: User preferences and account settings

### User Preferences

Customize your Veritas experience:

1. Click your profile icon in the top-right corner
2. Select "Preferences"
3. Adjust settings for:
   - Theme (light/dark mode)
   - Default visualizations
   - Notification preferences
   - Time zone
   - Language

## Account Management

### Profile Settings

Manage your user profile:

1. Click your profile icon
2. Select "Profile"
3. Update your:
   - Name
   - Email
   - Profile picture
   - Bio
   - Contact information

### Security Settings

Protect your account:

1. Click your profile icon
2. Select "Security"
3. Manage:
   - Password
   - Two-factor authentication
   - API keys
   - Session management
   - Login history

### Team Management

If you have team management permissions:

1. Navigate to Admin > Team Management
2. Add, remove, or modify team members
3. Assign roles and permissions
4. Create and manage teams

## Source Configuration

### Adding Sources

To add a new source:

1. Navigate to Sources > Add Source
2. Select the source type
3. Configure source-specific parameters:
   - For social media: accounts, keywords, hashtags
   - For websites: URLs, crawl frequency, depth
   - For RSS feeds: feed URLs, update frequency
4. Set collection parameters:
   - Collection frequency
   - Content filters
   - Historical data retrieval options
5. Save the configuration

### Managing Sources

To manage existing sources:

1. Navigate to Sources > Manage Sources
2. View a list of all configured sources
3. For each source, you can:
   - Edit configuration
   - Pause/resume collection
   - View collection statistics
   - Delete the source

### Source Groups

Organize sources into logical groups:

1. Navigate to Sources > Source Groups
2. Create a new group or select an existing one
3. Add or remove sources from the group
4. Use groups for filtering in analysis and reports

## Content Management

### Content Explorer

Browse and manage collected content:

1. Navigate to Content > Explorer
2. Use filters to narrow down content:
   - Source
   - Date range
   - Keywords
   - Content type
   - Narrative association
3. View content details:
   - Original content
   - Metadata
   - Source information
   - Engagement metrics
   - Related content
   - Associated narratives

### Content Tagging

Organize content with custom tags:

1. Select content items in the Content Explorer
2. Click "Tag" in the action bar
3. Add existing tags or create new ones
4. Use tags for filtering and organization

### Content Collections

Create collections of related content:

1. Navigate to Content > Collections
2. Create a new collection
3. Add content items manually or using filters
4. Use collections for focused analysis or reports

## Narrative Analysis

### Narrative Detection

Veritas automatically detects narratives based on:

- Content similarity
- Temporal patterns
- Source relationships
- Engagement patterns
- Keyword clustering

You can adjust detection sensitivity in Settings > Analysis Parameters.

### Narrative Explorer

Explore detected narratives:

1. Navigate to Narratives > Explorer
2. Browse the list of detected narratives
3. Filter by:
   - Time period
   - Sources
   - Keywords
   - Strength
   - Growth rate
4. Select a narrative to view details:
   - Timeline
   - Contributing content
   - Key sources
   - Related narratives
   - Branches

### Manual Narrative Creation

Create narratives manually:

1. Navigate to Narratives > Create Narrative
2. Provide a name and description
3. Add content items to the narrative
4. Define relationships between content items
5. Save the narrative

### Narrative Comparison

Compare multiple narratives:

1. Navigate to Narratives > Compare
2. Select two or more narratives
3. Choose comparison metrics:
   - Timeline overlap
   - Content similarity
   - Source overlap
   - Growth patterns
4. View the comparison visualization

## Visualization Tools

### Network Graph

Visualize relationships between content and sources:

1. Navigate to Narratives > Network Graph
2. Select narratives or content to visualize
3. Adjust visualization parameters:
   - Node types (content, sources, narratives)
   - Edge types (relationships)
   - Layout algorithm
   - Clustering options
4. Interact with the graph:
   - Zoom and pan
   - Select nodes for details
   - Adjust layout
   - Filter nodes and edges

### Narrative Flow

Visualize how narratives evolve over time:

1. Navigate to Narratives > Narrative Flow
2. Select narratives to visualize
3. Set the time range
4. Adjust visualization parameters:
   - Flow resolution
   - Branch visibility
   - Strength indicators
   - Color scheme
5. Interact with the flow:
   - Zoom in on time periods
   - Highlight branches
   - View content at specific points

### Reality Tunnel

Visualize divergent perspectives on topics:

1. Navigate to Narratives > Reality Tunnel
2. Select a topic or narrative
3. Set the time range
4. Adjust visualization parameters:
   - Tunnel width
   - Divergence sensitivity
   - Source grouping
5. Explore different perspectives within the tunnel

### Narrative Mycelium

Organic visualization of interconnected narratives:

1. Navigate to Narratives > Narrative Mycelium
2. Select narratives to visualize
3. Adjust visualization parameters:
   - Growth patterns
   - Connection strength
   - Temporal factors
4. Explore the organic structure of narrative connections

### Narrative Landscape

Topographical view of narrative strength:

1. Navigate to Narratives > Narrative Landscape
2. Select narratives to include
3. Choose the metric for elevation (strength, growth, engagement)
4. Explore the landscape:
   - Peaks (strong narratives)
   - Valleys (weak narratives)
   - Ridges (connected narratives)

## Search and Filtering

### Advanced Search

Perform complex searches across content and narratives:

1. Click the search icon in the top bar
2. Enter search terms
3. Use advanced operators:
   - Quotes for exact phrases
   - AND/OR for boolean logic
   - - (minus) to exclude terms
   - site: to limit to specific sources
   - date: for time ranges
4. Save searches for future use

### Filters

Apply filters in any view:

1. Click the filter icon
2. Select filter criteria:
   - Date range
   - Sources
   - Content types
   - Narratives
   - Tags
   - Custom metadata
3. Apply filters
4. Save filter combinations for reuse

## Reports and Exports

### Creating Reports

Generate comprehensive reports:

1. Navigate to Reports > Create Report
2. Select a report template or start from scratch
3. Add report components:
   - Visualizations
   - Data tables
   - Text analysis
   - Metrics and KPIs
4. Add commentary and annotations
5. Format and style the report
6. Save and generate the report

### Scheduling Reports

Set up recurring reports:

1. Navigate to Reports > Scheduled Reports
2. Create a new scheduled report
3. Select an existing report template
4. Set the schedule (daily, weekly, monthly)
5. Configure delivery options (email, download, dashboard)

### Exporting Data

Export data for external analysis:

1. From any view, click the Export button
2. Select export format:
   - CSV
   - JSON
   - Excel
   - PDF
   - Image (for visualizations)
3. Choose export options:
   - Data fields to include
   - Time range
   - Filters to apply
4. Generate and download the export

## Collaboration Features

### Sharing

Share analyses and reports:

1. Open the item you want to share
2. Click the Share button
3. Choose sharing options:
   - Share with specific users
   - Share with teams
   - Create a public link (if permitted)
   - Set permissions (view, edit, comment)
4. Add an optional message
5. Send the share invitation

### Comments and Annotations

Add comments to content, narratives, or reports:

1. Select the item you want to comment on
2. Click the Comment button
3. Enter your comment
4. Tag users with @ mentions
5. Add attachments if needed
6. Post the comment

For visualizations, you can add annotations:

1. Open the visualization
2. Click the Annotate button
3. Click on the point you want to annotate
4. Add your annotation text
5. Save the annotation

### Workspaces

Collaborate in shared workspaces:

1. Navigate to Workspaces
2. Create a new workspace or select an existing one
3. Invite team members
4. Add resources to the workspace:
   - Sources
   - Content collections
   - Narratives
   - Reports
   - Notes
5. Collaborate on analysis within the workspace

## Notifications and Alerts

### System Notifications

Receive notifications about system events:

1. Data collection status
2. Analysis completion
3. Report generation
4. System maintenance
5. User mentions

Access notifications via the bell icon in the top bar.

### Custom Alerts

Set up custom alerts:

1. Navigate to Settings > Alerts
2. Create a new alert
3. Define alert conditions:
   - Narrative emergence
   - Narrative growth rate
   - Source activity
   - Keyword mentions
   - Custom metrics
4. Set alert thresholds
5. Configure notification methods:
   - In-app notification
   - Email
   - SMS
   - Webhook

## Advanced Features

### API Integration

Integrate Veritas with external systems:

1. Navigate to Settings > API
2. Generate API keys
3. View API documentation
4. Test API endpoints
5. Monitor API usage

### Custom Visualizations

Create custom visualizations:

1. Navigate to Visualizations > Custom
2. Select a base visualization type
3. Configure data sources
4. Customize visual elements
5. Add interactive features
6. Save and share the custom visualization

### Data Enrichment

Enrich content with additional data:

1. Navigate to Admin > Data Enrichment
2. Configure enrichment services:
   - Sentiment analysis
   - Entity recognition
   - Topic classification
   - Language detection
   - Geolocation
3. Apply enrichment to selected content
4. Use enriched data in analysis and visualization

## Troubleshooting

### Common Issues

Solutions for common problems:

- **Data not updating**: Check source configuration and collection status
- **Visualizations not loading**: Clear browser cache or try a different browser
- **Search not returning expected results**: Review search syntax and filters
- **Reports failing to generate**: Check for data availability and filter settings
- **Slow performance**: Reduce data range or simplify visualization parameters

### Support Resources

Get help when needed:

- **In-app help**: Click the help icon (?) for contextual assistance
- **Knowledge base**: Access articles and tutorials at help.veritas-system.com
- **Community forum**: Discuss issues with other users at community.veritas-system.com
- **Support tickets**: Submit tickets through the support portal
- **Live chat**: Chat with support during business hours

## Glossary

- **Branch**: A divergent path that a narrative takes as it evolves
- **Consensus**: Areas where multiple narratives converge on similar points
- **Content**: Individual pieces of information (posts, articles, comments)
- **Edge**: A connection between nodes in a network graph
- **Narrative**: A cohesive story or theme that emerges from related content
- **Node**: An entity (content, source, narrative) in a network graph
- **Source**: A platform or channel from which content is collected
- **Reality Tunnel**: A visualization of divergent perspectives on a topic
- **Mycelium**: An organic visualization of interconnected narratives
- **Landscape**: A topographical visualization of narrative strength 