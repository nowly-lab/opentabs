import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { readParamsSource } from './tool.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'opentabs-tool-test-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readParamsSource', () => {
  test('returns undefined when no source is provided', async () => {
    const result = await readParamsSource(undefined, undefined, undefined);
    expect(result).toBeUndefined();
  });

  test('returns { json, origin } for --params flag', async () => {
    const result = await readParamsSource(undefined, '{"hello":"world"}', undefined);
    expect(result).toEqual({ json: '{"hello":"world"}', origin: '--params' });
  });

  test('returns { json, origin } for positional jsonArg', async () => {
    const result = await readParamsSource('{"a":1}', undefined, undefined);
    expect(result).toEqual({ json: '{"a":1}', origin: '[json]' });
  });

  test('reads JSON from --params-file path', async () => {
    const path = join(dir, 'payload.json');
    await writeFile(path, '{"hello":"world"}', 'utf8');
    const result = await readParamsSource(undefined, undefined, path);
    expect(result).toEqual({ json: '{"hello":"world"}', origin: path });
  });

  test('reads JSON from stdin when --params-file is -', async () => {
    const stdin = Readable.from([Buffer.from('{"x":1}')]);
    const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
    try {
      const result = await readParamsSource(undefined, undefined, '-');
      expect(result).toEqual({ json: '{"x":1}', origin: 'stdin' });
    } finally {
      if (descriptor) {
        Object.defineProperty(process, 'stdin', descriptor);
      }
    }
  });

  test('exits code 2 when jsonArg and --params are both given', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(readParamsSource('{"a":1}', '{"b":2}', undefined)).rejects.toThrow('exit');
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/Specify only one of:.*\[json\].*--params/));
      expect(exit).toHaveBeenCalledWith(2);
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test('exits code 2 when jsonArg and --params-file are both given', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(readParamsSource('{"a":1}', undefined, '/some/file.json')).rejects.toThrow('exit');
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/Specify only one of:.*\[json\].*--params-file/));
      expect(exit).toHaveBeenCalledWith(2);
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test('exits code 2 when --params-file points to a missing file', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(readParamsSource(undefined, undefined, '/nonexistent/path.json')).rejects.toThrow('exit');
      expect(err).toHaveBeenCalledWith(expect.stringMatching(/Failed to read params file \/nonexistent\/path\.json/));
      expect(exit).toHaveBeenCalledWith(2);
    } finally {
      exit.mockRestore();
      err.mockRestore();
    }
  });

  test('round-trips a 2 MB JSON payload without truncation', async () => {
    const bigString = 'x'.repeat(2 * 1024 * 1024);
    const path = join(dir, 'big.json');
    await writeFile(path, JSON.stringify({ data: bigString }), 'utf8');
    const result = await readParamsSource(undefined, undefined, path);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result?.json ?? '') as { data: string };
    expect(parsed.data.length).toBe(2 * 1024 * 1024);
    expect(parsed.data).toBe(bigString);
  });
});
