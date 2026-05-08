import { render } from '@testing-library/react';
import {
  generateSampleData,
  TemporalNarrativeVisualization,
} from '../../src/lib/components/TemporalNarrativeVisualization';

describe('TemporalNarrativeVisualization', () => {
  it('renders successfully', () => {
    const { baseElement } = render(<TemporalNarrativeVisualization data={generateSampleData()} />);
    expect(baseElement).toBeTruthy();
  });
});
