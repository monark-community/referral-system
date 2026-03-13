import {
  generateJWT,
  verifyJWT,
  generateReferralCode,
  verifyWalletSignature,
  generateEmailVerificationToken,
} from "@/services/auth.service.js";
import { ethers } from "ethers";

describe("test the auth service", () => {
  test("JWTs shoudl verify if given the correct secret", () => {
    const token = generateJWT(
      "user1",
      "0x1234567890123456789012345678901234567890",
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]{2,}(?:\.[A-Za-z0-9_-]{2,}){2}$/);

    const payload = verifyJWT(token);
    expect(payload).toEqual({
      userId: "user1",
      walletAddress: "0x1234567890123456789012345678901234567890",
      exp: expect.any(Number),
      iat: expect.any(Number),
    });
  });

  test("should generate a referral code", () => {
    const referralCode = generateReferralCode();
    expect(referralCode).toMatch(/^[A-Z0-9]{10}$/);
  });

  test("invalid signature returns false", async () => {
    const wallet = ethers.Wallet.createRandom();
    const otherWallet = ethers.Wallet.createRandom();

    const message = "Login to app";
    const signature = await wallet.signMessage(message);

    const result = verifyWalletSignature(
      message,
      signature,
      otherWallet.address,
    );

    expect(result).toBe(false);
  });
  test("valid signature returns true", async () => {
    const wallet = ethers.Wallet.createRandom();
    const otherWallet = ethers.Wallet.createRandom();

    const message = "Login to app";
    const signature = await wallet.signMessage(message);

    const result = verifyWalletSignature(message, signature, wallet.address);

    expect(result).toBe(true);
  });

  test("generate Email verification code", () => {
    const code = generateEmailVerificationToken();
    expect(code).toBeDefined();
  });
});
