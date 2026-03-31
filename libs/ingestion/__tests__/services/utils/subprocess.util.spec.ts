const mockExecFn = jest.fn();

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: () => mockExecFn,
}));

import { SubprocessUtil } from '../../../src/lib/services/utils/subprocess.util';

describe('SubprocessUtil', () => {
  let util: SubprocessUtil;

  beforeEach(() => {
    jest.clearAllMocks();
    util = new SubprocessUtil();
  });

  describe('exec', () => {
    it('should execute a command and return stdout/stderr with exit code 0', async () => {
      mockExecFn.mockResolvedValue({
        stdout: 'hello world\n',
        stderr: '',
      });

      const result = await util.exec('echo', ['hello', 'world']);

      expect(result).toEqual({
        stdout: 'hello world\n',
        stderr: '',
        exitCode: 0,
      });
      expect(mockExecFn).toHaveBeenCalledWith('echo', ['hello', 'world'], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        cwd: undefined,
        env: undefined,
      });
    });

    it('should respect custom timeout and maxBuffer options', async () => {
      mockExecFn.mockResolvedValue({ stdout: '', stderr: '' });

      await util.exec('cmd', ['arg'], {
        timeout: 5000,
        maxBuffer: 1024,
        cwd: '/tmp',
      });

      expect(mockExecFn).toHaveBeenCalledWith('cmd', ['arg'], {
        timeout: 5000,
        maxBuffer: 1024,
        cwd: '/tmp',
        env: undefined,
      });
    });

    it('should merge custom env with process.env', async () => {
      mockExecFn.mockResolvedValue({ stdout: '', stderr: '' });

      await util.exec('cmd', [], { env: { FOO: 'bar' } });

      const callArgs = mockExecFn.mock.calls[0][2];
      expect(callArgs.env).toEqual({ ...process.env, FOO: 'bar' });
    });

    it('should return non-zero exit code when command fails with stdout/stderr', async () => {
      const error = Object.assign(new Error('Command failed'), {
        stdout: 'partial output',
        stderr: 'error message',
        code: 1,
      });
      mockExecFn.mockRejectedValue(error);

      const result = await util.exec('bad-cmd', ['arg']);

      expect(result).toEqual({
        stdout: 'partial output',
        stderr: 'error message',
        exitCode: 1,
      });
    });

    it('should throw on ETIMEDOUT errors', async () => {
      const error = Object.assign(new Error('Timed out'), {
        code: 'ETIMEDOUT',
      });
      mockExecFn.mockRejectedValue(error);

      await expect(util.exec('slow-cmd', [], { timeout: 5000 })).rejects.toThrow(
        'Command timed out after 5000ms'
      );
    });

    it('should rethrow unknown errors without stdout/stderr', async () => {
      const error = new Error('ENOENT: command not found');
      mockExecFn.mockRejectedValue(error);

      await expect(util.exec('nonexistent', [])).rejects.toThrow(
        'ENOENT: command not found'
      );
    });

    it('should default exitCode to 1 when code is not a number', async () => {
      const error = Object.assign(new Error('fail'), {
        stdout: '',
        stderr: 'some error',
        code: undefined as unknown,
      });
      mockExecFn.mockRejectedValue(error);

      const result = await util.exec('cmd', []);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('execJson', () => {
    it('should parse JSON stdout on success', async () => {
      mockExecFn.mockResolvedValue({
        stdout: '{"key": "value"}',
        stderr: '',
      });

      const result = await util.execJson<{ key: string }>('cmd', ['--json']);

      expect(result).toEqual({ key: 'value' });
    });

    it('should throw when exit code is non-zero', async () => {
      const error = Object.assign(new Error('fail'), {
        stdout: '',
        stderr: 'bad args',
        code: 2,
      });
      mockExecFn.mockRejectedValue(error);

      await expect(util.execJson('cmd', [])).rejects.toThrow(
        'Command exited with code 2'
      );
    });

    it('should throw when stdout is not valid JSON', async () => {
      mockExecFn.mockResolvedValue({
        stdout: 'not json at all',
        stderr: '',
      });

      await expect(util.execJson('cmd', [])).rejects.toThrow(
        'Failed to parse JSON output from cmd'
      );
    });
  });

  describe('execJsonLines', () => {
    it('should parse each line of stdout as JSON', async () => {
      mockExecFn.mockResolvedValue({
        stdout: '{"id":1}\n{"id":2}\n{"id":3}\n',
        stderr: '',
      });

      const result = await util.execJsonLines<{ id: number }>('cmd', []);

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('should skip empty lines', async () => {
      mockExecFn.mockResolvedValue({
        stdout: '{"id":1}\n\n  \n{"id":2}\n',
        stderr: '',
      });

      const result = await util.execJsonLines<{ id: number }>('cmd', []);
      expect(result).toHaveLength(2);
    });

    it('should throw when a line is not valid JSON', async () => {
      mockExecFn.mockResolvedValue({
        stdout: '{"id":1}\nnot json\n',
        stderr: '',
      });

      await expect(util.execJsonLines('cmd', [])).rejects.toThrow(
        'Failed to parse JSON on line 2'
      );
    });

    it('should throw when exit code is non-zero', async () => {
      const error = Object.assign(new Error('fail'), {
        stdout: '',
        stderr: 'error',
        code: 1,
      });
      mockExecFn.mockRejectedValue(error);

      await expect(util.execJsonLines('cmd', [])).rejects.toThrow(
        'Command exited with code 1'
      );
    });
  });

  describe('checkAvailability', () => {
    it('should return true when the command is found', async () => {
      mockExecFn.mockResolvedValue({
        stdout: '/usr/bin/yt-dlp\n',
        stderr: '',
      });

      const result = await util.checkAvailability('yt-dlp');
      expect(result).toBe(true);
      expect(mockExecFn).toHaveBeenCalledWith(
        'which',
        ['yt-dlp'],
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should return false when the command is not found', async () => {
      const error = Object.assign(new Error('not found'), {
        stdout: '',
        stderr: '',
        code: 1,
      });
      mockExecFn.mockRejectedValue(error);

      const result = await util.checkAvailability('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false when which returns empty stdout', async () => {
      mockExecFn.mockResolvedValue({ stdout: '', stderr: '' });

      // exec returns exitCode 0 but stdout is empty
      const result = await util.checkAvailability('empty');
      expect(result).toBe(false);
    });

    it('should return false on unexpected errors', async () => {
      mockExecFn.mockRejectedValue(new Error('unexpected'));

      const result = await util.checkAvailability('cmd');
      expect(result).toBe(false);
    });
  });
});
