const UIUC_EMAIL_DOMAIN = "illinois.edu";

export class InvalidEmailDomainError extends Error {
  constructor() {
    super("Rally is currently limited to UIUC students with @illinois.edu emails.");
    this.name = "InvalidEmailDomainError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertUiucEmail(email: string) {
  const normalized = normalizeEmail(email);

  if (!normalized.endsWith(`@${UIUC_EMAIL_DOMAIN}`)) {
    throw new InvalidEmailDomainError();
  }

  return normalized;
}
