import {describe, expect, it} from 'vitest';
import {validateExternalUrl} from '../url-safety';

describe('validateExternalUrl', () => {
  it('accepts a normal https URL', () => {
    expect(validateExternalUrl('https://example.com/article').ok).toBe(true);
  });

  it('accepts a normal http URL', () => {
    expect(validateExternalUrl('http://example.com/').ok).toBe(true);
  });

  it('rejects malformed URLs', () => {
    expect(validateExternalUrl('not a url').ok).toBe(false);
  });

  it('rejects non-http protocols', () => {
    expect(validateExternalUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateExternalUrl('ftp://example.com/').ok).toBe(false);
    expect(validateExternalUrl('gopher://example.com/').ok).toBe(false);
  });

  it('rejects localhost', () => {
    expect(validateExternalUrl('http://localhost/admin').ok).toBe(false);
    expect(validateExternalUrl('http://LOCALHOST:8080/').ok).toBe(false);
  });

  it('rejects loopback addresses', () => {
    expect(validateExternalUrl('http://127.0.0.1/').ok).toBe(false);
    expect(validateExternalUrl('http://127.1.2.3/').ok).toBe(false);
    expect(validateExternalUrl('http://[::1]/').ok).toBe(false);
  });

  it('rejects private IPv4 ranges', () => {
    expect(validateExternalUrl('http://10.0.0.1/').ok).toBe(false);
    expect(validateExternalUrl('http://172.16.0.1/').ok).toBe(false);
    expect(validateExternalUrl('http://172.31.255.255/').ok).toBe(false);
    expect(validateExternalUrl('http://192.168.1.1/').ok).toBe(false);
    expect(validateExternalUrl('http://169.254.169.254/').ok).toBe(false);
    expect(validateExternalUrl('http://0.0.0.0/').ok).toBe(false);
  });

  it('accepts public IPv4 addresses outside private ranges', () => {
    expect(validateExternalUrl('http://172.32.0.1/').ok).toBe(true);
    expect(validateExternalUrl('http://8.8.8.8/').ok).toBe(true);
  });

  it('rejects integer and hex notation IPv4 addresses', () => {
    expect(validateExternalUrl('http://2130706433/').ok).toBe(false);
    expect(validateExternalUrl('http://0x7f000001/').ok).toBe(false);
  });

  it('rejects private IPv6 ranges', () => {
    expect(validateExternalUrl('http://[fc00::1]/').ok).toBe(false);
    expect(validateExternalUrl('http://[fe80::1]/').ok).toBe(false);
  });

  it('rejects non-default ports', () => {
    expect(validateExternalUrl('http://example.com:8787/').ok).toBe(false);
    expect(validateExternalUrl('https://example.com:8443/').ok).toBe(false);
  });

  it('accepts explicit default ports', () => {
    expect(validateExternalUrl('http://example.com:80/').ok).toBe(true);
    expect(validateExternalUrl('https://example.com:443/').ok).toBe(true);
  });

  it('rejects hostnames with trailing dots that alias blocked hosts', () => {
    expect(validateExternalUrl('http://localhost./').ok).toBe(false);
    expect(validateExternalUrl('http://printer.local./').ok).toBe(false);
    expect(validateExternalUrl('http://127.0.0.1./').ok).toBe(false);
  });

  it('rejects .local and .internal hostnames', () => {
    expect(validateExternalUrl('http://printer.local/').ok).toBe(false);
    expect(validateExternalUrl('http://metadata.internal/').ok).toBe(false);
  });
});
