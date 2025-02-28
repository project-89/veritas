import { render } from '@testing-library/react';

import VisualizationComponents from './visualization';

describe('VisualizationComponents', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<VisualizationComponents />);
    expect(baseElement).toBeTruthy();
  });
});
