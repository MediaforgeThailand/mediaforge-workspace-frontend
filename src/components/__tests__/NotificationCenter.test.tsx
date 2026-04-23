import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Mock useNotifications
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockClearAll = vi.fn();
const mockRequestBrowserPermission = vi.fn();

let mockNotifications: any[] = [];

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter((n: any) => !n.is_read).length,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    clearAll: mockClearAll,
    requestBrowserPermission: mockRequestBrowserPermission,
    refetch: vi.fn(),
  }),
}));

import NotificationCenter from "../NotificationCenter";

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("NotificationCenter", () => {
  beforeEach(() => {
    mockNotifications = [];
    vi.clearAllMocks();
  });

  it("renders bell icon button", () => {
    const { getByRole } = renderWithRouter(<NotificationCenter />);
    expect(getByRole("button")).toBeDefined();
  });

  it("shows unread badge when there are unread notifications", () => {
    mockNotifications = [
      {
        id: "1",
        type: "generation",
        title: "Video ready",
        message: "Your video is ready",
        icon: "film",
        link: null,
        is_read: false,
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];
    const { getByText } = renderWithRouter(<NotificationCenter />);
    expect(getByText("1")).toBeDefined();
  });

  it("shows 9+ for more than 9 unread", () => {
    mockNotifications = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      type: "generation",
      title: `Notification ${i}`,
      message: null,
      icon: "sparkles",
      link: null,
      is_read: false,
      metadata: {},
      created_at: new Date().toISOString(),
    }));
    const { getByText } = renderWithRouter(<NotificationCenter />);
    expect(getByText("9+")).toBeDefined();
  });

  it("opens popover and shows empty state", async () => {
    const { getByRole, getByText } = renderWithRouter(<NotificationCenter />);
    await userEvent.click(getByRole("button"));
    expect(getByText("No notifications yet")).toBeDefined();
  });

  it("requests browser permission on open", async () => {
    const { getByRole } = renderWithRouter(<NotificationCenter />);
    await userEvent.click(getByRole("button"));
    expect(mockRequestBrowserPermission).toHaveBeenCalled();
  });
});
