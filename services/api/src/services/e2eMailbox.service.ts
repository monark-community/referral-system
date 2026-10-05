export interface E2EEmailMessage {
  id: number;
  to: string;
  name: string | null;
  subject: string;
  token: string;
  verificationUrl: string;
  createdAt: string;
}

const messages: E2EEmailMessage[] = [];
let nextId = 1;

export function isE2EMailboxConfigured(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    process.env.EMAIL_PROVIDER === "memory" &&
    process.env.E2E_ENABLE_EMAIL_MAILBOX === "true" &&
    typeof process.env.E2E_MAILBOX_KEY === "string" &&
    process.env.E2E_MAILBOX_KEY.length >= 16
  );
}

export function assertE2EMailboxConfigured(): void {
  if (!isE2EMailboxConfigured()) {
    throw new Error(
      "The in-memory email provider requires NODE_ENV=test, E2E_ENABLE_EMAIL_MAILBOX=true, and an E2E_MAILBOX_KEY of at least 16 characters",
    );
  }
}

export function storeE2EEmail(
  message: Omit<E2EEmailMessage, "id" | "createdAt">,
): E2EEmailMessage {
  assertE2EMailboxConfigured();
  const stored = {
    ...message,
    id: nextId,
    createdAt: new Date().toISOString(),
  };
  nextId += 1;
  messages.push(stored);
  return stored;
}

export function listE2EEmails(to?: string): E2EEmailMessage[] {
  assertE2EMailboxConfigured();
  const normalizedTo = to?.trim().toLowerCase();
  return messages
    .filter((message) => !normalizedTo || message.to.toLowerCase() === normalizedTo)
    .map((message) => ({ ...message }));
}

export function clearE2EEmails(): void {
  assertE2EMailboxConfigured();
  messages.length = 0;
  nextId = 1;
}
