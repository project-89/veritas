# Consensus Reality Determination

This document outlines the methodologies and implementation tasks for determining consensus reality within the Veritas system.

## Conceptual Framework

Consensus reality is not a singular, objective truth but rather the dominant narrative accepted by the majority within a given context. It serves as a baseline against which other narratives can be measured and understood.

### Multi-Scale Analysis

Consensus reality exists at multiple scales:

1. **Global/International**: Broadly accepted facts and narratives across cultures
2. **National/Cultural**: Narratives dominant within specific cultural or national contexts
3. **Community/Local**: Beliefs shared within communities or regions
4. **Individual**: Personal reality tunnels that may align with or deviate from broader consensus

### Temporal Dimension

Consensus is not static but evolves over time:

1. **Historical Consensus**: What was once accepted as "fact"
2. **Current Consensus**: Present mainstream understanding
3. **Emerging Consensus**: Narratives gaining acceptance and potentially becoming dominant

## Technical Approach

### Data Collection and Analysis

1. **Source Weighting System**
   - Develop a scoring system for information sources based on:
     - Reach/audience size
     - Institutional authority
     - Citation frequency
     - Social amplification metrics
     - Historical reliability

2. **Content Analysis Pipeline**
   - Extract key claims and narratives from content
   - Identify narrative elements (actors, events, causal relationships)
   - Measure frequency and distribution of narrative elements
   - Track narrative evolution over time

3. **Consensus Calculation Algorithm**
   - Weighted aggregation of narratives across sources
   - Threshold determination for "consensus" status
   - Confidence scoring for consensus strength
   - Variance measurement to identify contested elements

### Implementation Components

#### Database Schema Extensions

```typescript
interface ConsensusMetrics {
  strength: number;          // 0-1, how strong the consensus is
  stability: number;         // 0-1, how stable over time
  contestation: number;      // 0-1, how contested by alternative narratives
  scope: ConsensusScope;     // The scale at which this consensus exists
  confidenceScore: number;   // Statistical confidence in the measurement
}

enum ConsensusScope {
  GLOBAL = 'global',
  NATIONAL = 'national',
  REGIONAL = 'regional',
  LOCAL = 'local',
  COMMUNITY = 'community'
}

interface ConsensusNarrative {
  id: string;
  elements: NarrativeElement[];
  metrics: ConsensusMetrics;
  temporalData: {
    emergenceDate?: Date;    // When this narrative first appeared
    peakDate?: Date;         // When this narrative reached maximum consensus
    declineDate?: Date;      // When this narrative began losing consensus status
  };
  geographicScope: {
    type: 'global' | 'country' | 'region';
    value?: string;          // e.g., country code or region name
  };
}
```

#### API Endpoints

1. **Consensus Retrieval**
   - `GET /api/consensus?scope=SCOPE&region=REGION&timeframe=TIMEFRAME`
   - Returns the current consensus narrative for the specified parameters

2. **Consensus Comparison**
   - `GET /api/consensus/compare?narrative1=ID1&narrative2=ID2`
   - Compares two narratives against the consensus baseline

3. **Consensus Timeline**
   - `GET /api/consensus/timeline?topic=TOPIC&startDate=DATE&endDate=DATE`
   - Returns how consensus has evolved over time for a specific topic

4. **Consensus Map**
   - `GET /api/consensus/map?topic=TOPIC&date=DATE`
   - Returns geographical distribution of consensus vs. alternative narratives

## Implementation Tasks

### Phase 1: Foundation

1. [ ] Design and implement the consensus metrics data structures
2. [ ] Develop source weighting algorithm
3. [ ] Create basic consensus calculation pipeline
4. [ ] Implement API endpoints for consensus retrieval
5. [ ] Extend the database schema to store consensus metrics

### Phase 2: Advanced Analysis

6. [ ] Implement multi-scale consensus analysis (global to local)
7. [ ] Develop temporal analysis of consensus evolution
8. [ ] Create algorithms to detect emerging consensus shifts
9. [ ] Implement confidence scoring for consensus measurements
10. [ ] Develop methods to identify contested elements within consensus narratives

### Phase 3: Visualization and Interaction

11. [ ] Extend visualization components to display consensus baselines
12. [ ] Create interfaces for exploring consensus at different scales
13. [ ] Implement timeline visualizations of consensus evolution
14. [ ] Develop geographic mapping of consensus distribution
15. [ ] Create interactive tools for comparing narratives against consensus

## Integration Points

- **Analysis Service**: Extend to include consensus determination methods
- **Visualization Components**: Update to visualize consensus baselines
- **Data Ingestion**: Enhance to capture metadata relevant to consensus calculation
- **API**: Add endpoints for consensus-related queries

## Evaluation Metrics

To measure the effectiveness of consensus determination:

1. **Accuracy**: Compare algorithmic consensus determination against expert analysis
2. **Stability**: Measure how consistent consensus calculations are over time
3. **Responsiveness**: How quickly the system detects shifts in consensus
4. **Granularity**: Ability to identify consensus at different scales
5. **Explanatory Power**: How well the system explains why something is considered consensus 