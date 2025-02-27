import { render } from '@testing-library/react';

import VisualizationComponents from './visualization-components';

describe('VisualizationComponents', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<VisualizationComponents />);
    expect(baseElement).toBeTruthy();
  });
});
