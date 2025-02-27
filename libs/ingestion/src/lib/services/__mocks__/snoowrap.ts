export class MockSnoowrap {
  search: jest.Mock;
  getUser: jest.Mock;
  getMe: jest.Mock;

  constructor(config: any) {
    this.search = jest.fn();
    this.getUser = jest.fn();
    this.getMe = jest.fn();
  }
}

export default MockSnoowrap;
