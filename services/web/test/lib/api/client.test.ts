// Purpose: Unit tests for the base API client - auth header injection, JSON parsing, and ApiError on failures

import { apiClient, ApiError } from "@/lib/api/client";

function mockFetch(status: number, json: () => Promise<unknown>) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json,
  });
  global.fetch = fetchMock;
  return fetchMock;
}

describe("apiClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  test("returns the parsed JSON body of a successful response", async () => {
    const fetchMock = mockFetch(200, async () => ({ user: { id: "user-1" } }));

    const data = await apiClient<{ user: { id: string } }>("/auth/me");

    expect(data).toEqual({ user: { id: "user-1" } });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  test("attaches the stored JWT as a Bearer token", async () => {
    localStorage.setItem("token", "jwt-123");
    const fetchMock = mockFetch(200, async () => ({}));

    await apiClient("/users/profile");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-123",
    });
  });

  test("passes the method and body through and lets callers add headers", async () => {
    const fetchMock = mockFetch(200, async () => ({}));

    await apiClient("/users/profile", {
      method: "PUT",
      body: '{"name":"Alice"}',
      headers: { "X-Trace": "abc" },
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"name":"Alice"}');
    expect(init.headers).toEqual({ "Content-Type": "application/json", "X-Trace": "abc" });
  });

  test("throws an ApiError carrying the server's message, status, and body", async () => {
    mockFetch(409, async () => ({ error: "Email already in use" }));

    const request = apiClient("/users/profile");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      message: "Email already in use",
      status: 409,
      data: { error: "Email already in use" },
    });
  });

  test("falls back to a generic message when the error body is not JSON", async () => {
    mockFetch(502, async () => {
      throw new SyntaxError("Unexpected token <");
    });

    await expect(apiClient("/users/profile")).rejects.toMatchObject({
      name: "ApiError",
      message: "An error occurred",
      status: 502,
    });
  });
});
