import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLoginRequired } from "../useLoginRequired";

// Mock the AuthContext
const mockUser = { id: "user-123", email: "test@test.com" };
let currentUser: typeof mockUser | null = mockUser;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: currentUser }),
}));

describe("useLoginRequired", () => {
  beforeEach(() => {
    currentUser = mockUser;
  });

  it("executes action immediately when user is authenticated", () => {
    const { result } = renderHook(() => useLoginRequired());
    const action = vi.fn();

    act(() => {
      result.current.requireLogin(action);
    });

    expect(action).toHaveBeenCalledOnce();
    expect(result.current.showLogin).toBe(false);
  });

  it("shows login dialog when user is guest", () => {
    currentUser = null;
    const { result } = renderHook(() => useLoginRequired());
    const action = vi.fn();

    act(() => {
      result.current.requireLogin(action);
    });

    expect(action).not.toHaveBeenCalled();
    expect(result.current.showLogin).toBe(true);
  });

  it("reports isGuest correctly", () => {
    currentUser = null;
    const { result } = renderHook(() => useLoginRequired());
    expect(result.current.isGuest).toBe(true);

    currentUser = mockUser;
    const { result: result2 } = renderHook(() => useLoginRequired());
    expect(result2.current.isGuest).toBe(false);
  });

  it("clears pending action on dialog close", () => {
    currentUser = null;
    const { result } = renderHook(() => useLoginRequired());

    act(() => {
      result.current.requireLogin(vi.fn());
    });
    expect(result.current.showLogin).toBe(true);

    act(() => {
      result.current.onOpenChange(false);
    });
    expect(result.current.showLogin).toBe(false);
  });
});
