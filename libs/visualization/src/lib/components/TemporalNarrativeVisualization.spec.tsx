import { render } from '@testing-library/react';
import { TemporalNarrativeVisualization, generateSampleData } from './TemporalNarrativeVisualization';

describe('TemporalNarrativeVisualization', () => {
  it('renders successfully', () => {
    const { baseElement } = render(
      <TemporalNarrativeVisualization data={generateSampleData()} />
    );
    expect(baseElement).toBeTruthy();
  });
}); 