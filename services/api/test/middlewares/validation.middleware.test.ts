// Purpose: Unit tests for request validation (wallet login and profile update payloads)
// Notes:
// - Runs each express-validator chain against a fake request, then the error handler at the end

import {
  validateWalletAuth,
  validateProfileUpdate,
} from "@/middlewares/validation.middleware.js";

// Runs a validation middleware list the way Express would
async function runValidation(middlewares: any[], body: Record<string, unknown>) {
  const req: any = { body };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  for (const chain of middlewares.slice(0, -1)) {
    await chain.run(req);
  }
  middlewares[middlewares.length - 1](req, res, next);

  return { req, res, next };
}

// Expects a 400 response that reports the given field and message
function expectFieldError(res: any, path: string, msg: string) {
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({
    error: "Validation failed",
    details: expect.arrayContaining([expect.objectContaining({ path, msg })]),
  });
}

describe("validateWalletAuth", () => {
  const validBody = {
    walletAddress: "0x1234567890123456789012345678901234567890",
    signature: "0xsignature",
    message: "Sign in to Reffinity",
  };

  test("passes a valid login request through", async () => {
    const { res, next } = await runValidation(validateWalletAuth, validBody);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("rejects a malformed wallet address", async () => {
    const { res, next } = await runValidation(validateWalletAuth, {
      ...validBody,
      walletAddress: "0x123",
    });

    expectFieldError(res, "walletAddress", "Invalid Ethereum address");
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects a missing signature", async () => {
    const { res } = await runValidation(validateWalletAuth, {
      ...validBody,
      signature: "",
    });

    expectFieldError(res, "signature", "Signature is required");
  });

  test("rejects a missing message", async () => {
    const { res } = await runValidation(validateWalletAuth, {
      ...validBody,
      message: "",
    });

    expectFieldError(res, "message", "Message is required");
  });
});

describe("validateProfileUpdate", () => {
  test("passes a valid profile and cleans up the name and email", async () => {
    const { req, next } = await runValidation(validateProfileUpdate, {
      name: "  Alice  ",
      email: "Alice@Example.com",
      phone: "+1 555-123-4567",
    });

    expect(next).toHaveBeenCalled();
    expect(req.body.name).toBe("Alice");
    expect(req.body.email).toBe("alice@example.com");
  });

  test("allows the phone number to be left out", async () => {
    const { next } = await runValidation(validateProfileUpdate, {
      name: "Alice",
      email: "alice@example.com",
    });

    expect(next).toHaveBeenCalled();
  });

  test.each([
    ["an empty name", ""],
    ["a name over 100 characters", "a".repeat(101)],
  ])("rejects %s", async (_label, name) => {
    const { res } = await runValidation(validateProfileUpdate, {
      name,
      email: "alice@example.com",
    });

    expectFieldError(res, "name", "Name must be between 1 and 100 characters");
  });

  test("rejects an invalid email", async () => {
    const { res } = await runValidation(validateProfileUpdate, {
      name: "Alice",
      email: "not-an-email",
    });

    expectFieldError(res, "email", "Valid email is required");
  });

  test("rejects a phone number with letters", async () => {
    const { res } = await runValidation(validateProfileUpdate, {
      name: "Alice",
      email: "alice@example.com",
      phone: "call me",
    });

    expectFieldError(res, "phone", "Invalid phone number format");
  });
});
