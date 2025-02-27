import { render } from '@testing-library/react';

import TemporalNarrative from './temporal-narrative';

describe('TemporalNarrative', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<TemporalNarrative />);
    expect(baseElement).toBeTruthy();
  });
});
