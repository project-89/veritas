import { render } from '@testing-library/react';

import RealityTunnel from './reality-tunnel';

describe('RealityTunnel', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<RealityTunnel />);
    expect(baseElement).toBeTruthy();
  });
});
