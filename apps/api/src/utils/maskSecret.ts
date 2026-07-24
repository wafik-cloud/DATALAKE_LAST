export function maskSecret(value?: string | null, visible = 4): string {
  if (!value) return '••••••••';
  if (value.length <= visible) return '••••••••';
  return `${value.slice(0, visible)}${'•'.repeat(8)}`;
}

export function redactSensitiveText(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of secrets) {
    if (secret && secret.length > 3) {
      output = output.split(secret).join('[REDACTED]');
    }
  }
  return output;
}
