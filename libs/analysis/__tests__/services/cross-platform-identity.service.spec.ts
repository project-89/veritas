import { CrossPlatformIdentityService } from '../../src/lib/services/cross-platform-identity.service';

// Mock execFile to avoid actually running Sherlock in tests
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  rm: jest.fn().mockResolvedValue(undefined),
}));

import { execFile } from 'child_process';
import { readFile } from 'fs/promises';

const mockExecFile = execFile as unknown as jest.Mock;
const mockReadFile = readFile as unknown as jest.Mock;

describe('CrossPlatformIdentityService', () => {
  let service: CrossPlatformIdentityService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock sherlock --version succeeding
    mockExecFile.mockImplementation(
      (cmd: string, args: string[], opts: unknown, cb: Function) => {
        if (args[0] === '--version') {
          cb(null, 'Sherlock v0.16.0', '');
          return;
        }
        // Default: simulate sherlock running successfully
        cb(null, '[*] Search completed with 3 results', '');
      },
    );

    service = new CrossPlatformIdentityService();
  });

  describe('resolveIdentity', () => {
    it('should parse CSV output and return discovered accounts', async () => {
      const csvContent = [
        'username,name,url_main,url_user,exists,http_status,response_time_s',
        'testuser,Twitter,https://twitter.com,https://twitter.com/testuser,Claimed,200,0.5',
        'testuser,Reddit,https://reddit.com,https://www.reddit.com/user/testuser,Claimed,200,0.8',
        'testuser,GitHub,https://github.com,https://www.github.com/testuser,Claimed,200,0.3',
        'testuser,SomeObscureSite,https://obscure.com,https://obscure.com/testuser,Claimed,200,0.2',
      ].join('\n');

      mockReadFile.mockResolvedValue(csvContent);

      const result = await service.resolveIdentity('testuser');

      expect(result.queriedUsername).toBe('testuser');
      expect(result.totalFound).toBe(4);
      expect(result.accounts).toHaveLength(4);

      // Twitter and Reddit should be in relevant accounts
      const relevantPlatforms = result.relevantAccounts.map((a) => a.platform);
      expect(relevantPlatforms).toContain('twitter');
      expect(relevantPlatforms).toContain('reddit');
    });

    it('should strip @ prefix from username', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await service.resolveIdentity('@testuser');
      expect(result.queriedUsername).toBe('testuser');
    });

    it('should strip u/ prefix from Reddit usernames', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await service.resolveIdentity('u/testuser');
      expect(result.queriedUsername).toBe('testuser');
    });

    it('should return empty results when Sherlock produces no output', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await service.resolveIdentity('nonexistent_user_xyz');
      expect(result.accounts).toHaveLength(0);
      expect(result.relevantAccounts).toHaveLength(0);
      expect(result.totalFound).toBe(0);
    });

    it('should cache results', async () => {
      const csvContent = [
        'username,name,url_main,url_user,exists,http_status,response_time_s',
        'cached,Twitter,https://twitter.com,https://twitter.com/cached,Claimed,200,0.5',
      ].join('\n');
      mockReadFile.mockResolvedValue(csvContent);

      // First call — hits Sherlock
      const result1 = await service.resolveIdentity('cached');
      // Second call — should use cache
      const result2 = await service.resolveIdentity('cached');

      expect(result1.totalFound).toBe(result2.totalFound);
      // execFile should have been called for --version + one sherlock run, not two
      const sherlockCalls = mockExecFile.mock.calls.filter(
        (call: unknown[]) => !(call[1] as string[])[0]?.includes('--version'),
      );
      expect(sherlockCalls.length).toBe(1);
    });

    it('should handle Sherlock execution failure gracefully', async () => {
      mockExecFile.mockImplementation(
        (cmd: string, args: string[], opts: unknown, cb: Function) => {
          if (args[0] === '--version') {
            cb(null, 'Sherlock v0.16.0', '');
            return;
          }
          cb(new Error('Sherlock crashed'), '', 'error');
        },
      );
      // readFile should also fail (no output file created)
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.resolveIdentity('failuser');
      expect(result.accounts).toHaveLength(0);
    });

    it('should normalize platform names from URLs', async () => {
      const csvContent = [
        'username,name,url_main,url_user,exists,http_status,response_time_s',
        'user,X,https://x.com,https://x.com/user,Claimed,200,0.5',
        'user,Bluesky,https://bsky.app,https://bsky.app/profile/user.bsky.social,Claimed,200,0.3',
        'user,threads,https://threads.net,https://www.threads.net/@user,Claimed,200,0.4',
      ].join('\n');
      mockReadFile.mockResolvedValue(csvContent);

      const result = await service.resolveIdentity('user');
      const platforms = result.accounts.map((a) => a.platform);

      expect(platforms).toContain('twitter'); // x.com → twitter
      expect(platforms).toContain('bluesky');
      expect(platforms).toContain('threads');
    });

    it('should skip non-claimed accounts', async () => {
      const csvContent = [
        'username,name,url_main,url_user,exists,http_status,response_time_s',
        'user,Twitter,https://twitter.com,https://twitter.com/user,Claimed,200,0.5',
        'user,Reddit,https://reddit.com,https://reddit.com/user/user,Not Found,404,0.3',
      ].join('\n');
      mockReadFile.mockResolvedValue(csvContent);

      const result = await service.resolveIdentity('user');
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]!.platform).toBe('twitter');
    });
  });

  describe('batchResolve', () => {
    it('should resolve multiple usernames', async () => {
      mockReadFile.mockResolvedValue(
        'username,name,url_main,url_user,exists,http_status,response_time_s\nuser,Twitter,https://twitter.com,https://twitter.com/user,Claimed,200,0.5',
      );

      const results = await service.batchResolve(['user1', 'user2']);
      expect(results.size).toBe(2);
      expect(results.has('user1')).toBe(true);
      expect(results.has('user2')).toBe(true);
    });

    it('should handle individual failures without blocking others', async () => {
      let callCount = 0;
      mockReadFile.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('fail');
        return Promise.resolve(
          'username,name,url_main,url_user,exists,http_status,response_time_s\nuser,Twitter,https://twitter.com,https://twitter.com/user,Claimed,200,0.5',
        );
      });

      const results = await service.batchResolve(['fail_user', 'good_user']);
      expect(results.size).toBe(2);
      expect(results.get('fail_user')!.totalFound).toBe(0);
    });
  });
});
