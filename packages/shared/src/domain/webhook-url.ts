import { lookup } from 'node:dns/promises';
import * as ipaddr from 'ipaddr.js';

export interface WebhookAddress {
  address: string;
  family: number;
}

export type WebhookAddressResolver = (hostname: string) => Promise<WebhookAddress[]>;

export function parseAllowedWebhookHosts(value?: string): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
  );
}

export function validateWebhookUrl(value: string, allowedHosts: Set<string> = new Set()): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('Webhook destination must be a valid URL.', { cause: error });
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error('Webhook destination must use HTTPS without credentials, fragments, or a custom port.');
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new Error('Webhook destination hostname is invalid.');
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Webhook destination must not use a local or internal hostname.');
  }

  if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) {
    throw new Error('Webhook destination must not use a non-public IP address.');
  }

  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
    throw new Error('Webhook destination host is not in the configured allowlist.');
  }

  return url;
}

export async function resolvePublicWebhookAddresses(
  hostname: string,
  resolver: WebhookAddressResolver = (host) => lookup(host, { all: true, verbatim: true }),
): Promise<WebhookAddress[]> {
  const normalizedHostname = normalizeHostname(hostname);
  const addresses = ipaddr.isValid(normalizedHostname)
    ? [{ address: normalizedHostname, family: ipaddr.parse(normalizedHostname).kind() === 'ipv4' ? 4 : 6 }]
    : await resolver(normalizedHostname);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Webhook hostname must resolve only to public IP addresses.');
  }

  return addresses;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
}

function isPublicAddress(value: string): boolean {
  if (!ipaddr.isValid(value)) {
    return false;
  }

  const address = ipaddr.parse(value);
  if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
    return address.toIPv4Address().range() === 'unicast';
  }

  return address.range() === 'unicast';
}
