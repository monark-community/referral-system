// Purpose: Unit tests for the email service (console mode and SMTP mode)
// Notes:
// - The service reads its settings when it loads, so each test sets env vars and loads a fresh copy

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn((_options: unknown) => ({ sendMail: mockSendMail }));

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: (options: unknown) => mockCreateTransport(options) },
}));

const originalEnv = process.env;

const smtpSettings = {
  API_URL: "http://api.test",
  FROM_NAME: "Reffinity",
  FROM_EMAIL: "noreply@reffinity.io",
  SMTP_HOST: "smtp.test",
  SMTP_PORT: "465",
  SMTP_SECURE: "true",
  SMTP_USER: "mailer",
  SMTP_PASS: "secret",
};

// Loads a fresh copy of the email service with only the given email settings
function loadEmailService(settings: Record<string, string> = {}) {
  jest.resetModules();
  const {
    EMAIL_PROVIDER,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    ...otherEnv
  } = originalEnv;
  process.env = { ...otherEnv, ...settings };
  return import("@/services/email.service.js");
}

describe("sendVerificationEmail", () => {
  const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
    consoleLog.mockRestore();
    consoleError.mockRestore();
  });

  test("prints the verification link to the console when SMTP is not configured", async () => {
    const { sendVerificationEmail } = await loadEmailService({ API_URL: "http://api.test" });

    await sendVerificationEmail("alice@example.com", "token123", "Alice");

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith(
      "Verification Link: http://api.test/api/users/verify-email/token123",
    );
  });

  test("stays in console mode when EMAIL_PROVIDER is console, even with SMTP set up", async () => {
    const { sendVerificationEmail } = await loadEmailService({
      ...smtpSettings,
      EMAIL_PROVIDER: "console",
    });

    await sendVerificationEmail("alice@example.com", "token123");

    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleLog).toHaveBeenCalledWith("Name: User");
  });

  test("stores verification data in the guarded E2E mailbox", async () => {
    const { sendVerificationEmail } = await loadEmailService({
      API_URL: "http://api.test",
      NODE_ENV: "test",
      EMAIL_PROVIDER: "memory",
      E2E_ENABLE_EMAIL_MAILBOX: "true",
      E2E_MAILBOX_KEY: "test-mailbox-key-123",
    });
    const { listE2EEmails } = await import("@/services/e2eMailbox.service.js");

    await sendVerificationEmail("alice@example.com", "token123", "Alice");

    expect(listE2EEmails("alice@example.com")).toEqual([
      expect.objectContaining({
        to: "alice@example.com",
        name: "Alice",
        token: "token123",
        verificationUrl: "http://api.test/api/users/verify-email/token123",
      }),
    ]);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test("refuses to enable the memory mailbox outside the guarded E2E environment", async () => {
    await expect(loadEmailService({ EMAIL_PROVIDER: "memory", NODE_ENV: "production" })).rejects.toThrow(
      "in-memory email provider requires NODE_ENV=test",
    );
  });

  test("sends the email through SMTP when it is configured", async () => {
    const { sendVerificationEmail } = await loadEmailService({
      ...smtpSettings,
      EMAIL_PROVIDER: "smtp",
    });
    mockSendMail.mockResolvedValue({ messageId: "message1" });

    await sendVerificationEmail("alice@example.com", "token123", "Alice");

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.test",
      port: 465,
      secure: true,
      auth: { user: "mailer", pass: "secret" },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"Reffinity" <noreply@reffinity.io>',
      to: "alice@example.com",
      subject: "Verify your email for Reffinity",
      html: expect.stringContaining("http://api.test/api/users/verify-email/token123"),
    });
    expect(mockSendMail.mock.calls[0][0].html).toContain("Hi Alice");
  });

  test("passes SMTP failures on so the caller can report them", async () => {
    const { sendVerificationEmail } = await loadEmailService({
      ...smtpSettings,
      EMAIL_PROVIDER: "smtp",
    });
    mockSendMail.mockRejectedValue(new Error("smtp down"));

    await expect(sendVerificationEmail("alice@example.com", "token123")).rejects.toThrow(
      "smtp down",
    );
  });
});
