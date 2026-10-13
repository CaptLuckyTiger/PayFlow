import { jest } from '@jest/globals';
import { parseAllowedWebhookHosts, resolvePublicWebhookAddresses, validateWebhookUrl } from '@payflow/shared';

describe('webhook destination policy', () => {
  it('requires HTTPS and accepts an exact host allowlist', () => {
    const allowlist = parseAllowedWebhookHosts('hooks.example.com, api.example.com.');

    expect(validateWebhookUrl('https://hooks.example.com/callback', allowlist).hostname).toBe('hooks.example.com');
    expect(() => validateWebhookUrl('https://sub.hooks.example.com/callback', allowlist)).toThrow(/allowlist/);
    expect(() => validateWebhookUrl('http://hooks.example.com/callback')).toThrow(/HTTPS/);
    expect(() => validateWebhookUrl('https://user:pass@hooks.example.com/callback')).toThrow(/HTTPS/);
    expect(() => validateWebhookUrl('https://hooks.example.com:8443/callback')).toThrow(/HTTPS/);
  });

  it.each([
    'https://localhost/hook',
    'https://service.internal/hook',
    'https://127.0.0.1/hook',
    'https://10.10.0.1/hook',
    'https://172.16.4.5/hook',
    'https://172.31.255.1/hook',
    'https://192.168.1.2/hook',
    'https://169.254.169.254/hook',
    'https://[::1]/hook',
    'https://[fc00::1]/hook',
    'https://[fe80::1]/hook',
    'https://[::ffff:127.0.0.1]/hook',
  ])('rejects non-public literal destination %s', (url) => {
    expect(() => validateWebhookUrl(url)).toThrow();
  });

  it('accepts DNS results only when every returned address is public', async () => {
    const publicResolver = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
    await expect(resolvePublicWebhookAddresses('hooks.example.com', publicResolver)).resolves.toHaveLength(2);
    expect(publicResolver).toHaveBeenCalledWith('hooks.example.com');

    const mixedResolver = jest.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);
    await expect(resolvePublicWebhookAddresses('hooks.example.com', mixedResolver)).rejects.toThrow(/public IP/);
  });
});
