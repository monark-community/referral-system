// Purpose: Unit tests for the central error middleware and the createError helper

import { errorHandler, createError } from "@/middlewares/error.middleware.js";

describe("errorHandler", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let res: any;

  beforeEach(() => {
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  test("sends the status and message of an expected error", () => {
    errorHandler(createError("Campaign not found", 404), {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Campaign not found" });
  });

  test("hides an unexpected error's details behind a 500", () => {
    errorHandler(new Error("secret database details"), {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  test("includes the stack trace only in development", () => {
    process.env.NODE_ENV = "development";
    const error = createError("Bad input", 400);

    errorHandler(error, {} as any, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ error: "Bad input", stack: error.stack });
  });
});

describe("createError", () => {
  test("marks the error as expected and keeps its status code", () => {
    const error = createError("Bad input", 400);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Bad input");
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
  });
});
