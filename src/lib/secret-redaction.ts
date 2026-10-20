export function redactSecretsFromText(value: string, secrets: string[]): string {
  return secrets
    .filter((secret) => secret.length >= 4)
    .sort((left, right) => right.length - left.length)
    .reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
}
