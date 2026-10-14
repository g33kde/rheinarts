import { describe, expect, it } from 'vitest';
import { ONLINE_SERVER } from '../src/config/GameConfig';
import { pickServerUrl } from '../src/systems/OnlineServerConfig';

describe('pickServerUrl', () => {
  it('falls back to the baked-in default', () => {
    expect(pickServerUrl(null, undefined)).toBe(ONLINE_SERVER.defaultUrl);
  });

  it('prefers the build-time value over the default', () => {
    expect(pickServerUrl(null, 'ws://build.example:9000')).toBe('ws://build.example:9000');
  });

  it('prefers the localStorage override over everything', () => {
    expect(pickServerUrl('wss://test.example/ws', 'ws://build.example:9000')).toBe(
      'wss://test.example/ws',
    );
  });

  it('trims whitespace', () => {
    expect(pickServerUrl('  ws://a.example:1  ', undefined)).toBe('ws://a.example:1');
  });

  it('ignores values that are not ws:// or wss:// URLs', () => {
    expect(pickServerUrl('http://nope', 'debris.example.com')).toBe(ONLINE_SERVER.defaultUrl);
    expect(pickServerUrl('', '   ')).toBe(ONLINE_SERVER.defaultUrl);
  });

  it('falls through a bad override to a good build-time value', () => {
    expect(pickServerUrl('garbage', 'ws://build.example:9000')).toBe('ws://build.example:9000');
  });
});
