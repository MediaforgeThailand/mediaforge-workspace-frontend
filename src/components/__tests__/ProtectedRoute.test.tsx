import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "../ProtectedRoute";

// Mock useAuth
let mockAuthState = { user: null as unknown, loading: true };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

// Track Navigate calls
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Navigate: (props: { to: string }) => {
      mockNavigate(props.to);
      return <div data-testid="navigate">{props.to}</div>;
    },
  };
});

describe("ProtectedRoute", () => {
  it("shows loader when loading", () => {
    mockAuthState = { user: null, loading: true };
    const { getByText, queryByText } = render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(getByText("Loading...")).toBeInTheDocument();
    expect(queryByText("Protected")).not.toBeInTheDocument();
  });

  it("redirects to /auth when no user", () => {
    mockAuthState = { user: null, loading: false };
    const { getByTestId } = render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(getByTestId("navigate")).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith("/auth");
  });

  it("renders children when authenticated", () => {
    mockAuthState = { user: { id: "123" }, loading: false };
    const { getByText } = render(
      <MemoryRouter>
        <ProtectedRoute><div>Protected Content</div></ProtectedRoute>
      </MemoryRouter>
    );
    expect(getByText("Protected Content")).toBeInTheDocument();
  });
});
