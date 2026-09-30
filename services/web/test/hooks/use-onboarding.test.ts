// Purpose: Unit tests for the onboarding step state machine (wallet -> terms -> profile -> verify-email -> success)

import { renderHook, act } from "@testing-library/react";
import { useOnboarding } from "@/hooks/use-onboarding";

describe("useOnboarding", () => {
  test("starts closed on the wallet step", () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.step).toBe("wallet");
    expect(result.current.isOpen).toBe(false);
  });

  test("nextStep walks through every step in order and stops at success", () => {
    const { result } = renderHook(() => useOnboarding());
    const visited = [result.current.step];

    for (let i = 0; i < 5; i++) {
      act(() => result.current.nextStep());
      visited.push(result.current.step);
    }

    expect(visited).toEqual(["wallet", "terms", "profile", "verify-email", "success", "success"]);
  });

  test("previousStep goes back one step and stops at wallet", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep("terms"));
    act(() => result.current.previousStep());
    expect(result.current.step).toBe("wallet");

    act(() => result.current.previousStep());
    expect(result.current.step).toBe("wallet");
  });

  test("openOnboarding opens the modal from the wallet step", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep("profile"));
    act(() => result.current.openOnboarding());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.step).toBe("wallet");
  });

  test("closeOnboarding keeps the current step, reset goes back to wallet", () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.openOnboarding());
    act(() => result.current.goToStep("verify-email"));
    act(() => result.current.closeOnboarding());
    expect(result.current).toMatchObject({ isOpen: false, step: "verify-email" });

    act(() => result.current.openOnboarding());
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ isOpen: false, step: "wallet" });
  });
});
