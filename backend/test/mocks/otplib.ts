export function generateSecret(): string {
  return 'JBSWY3DPEHPK3PXP';
}

export function generateURI(options: {
  issuer: string;
  label: string;
  secret: string;
}): string {
  return `otpauth://totp/${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.label)}?secret=${options.secret}`;
}

export function verify(): Promise<{ valid: boolean }> {
  return Promise.resolve({ valid: true });
}
