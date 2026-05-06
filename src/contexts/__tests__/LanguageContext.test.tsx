import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "../LanguageContext";

const setNavigatorLanguage = (languages: readonly string[], language = languages[0] ?? "") => {
  Object.defineProperty(navigator, "languages", {
    configurable: true,
    value: [...languages],
  });
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: language,
  });
};

const TestConsumer = () => {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="translated">{t("analytics")}</span>
      <span data-testid="with-params">{t("savePercent", { n: 20 })}</span>
      <span data-testid="with-special-param">{t("upgradeTo", { name: "$&" })}</span>
      <button onClick={() => setLanguage("th")}>Switch to TH</button>
      <button onClick={() => setLanguage("en")}>Switch to EN</button>
    </div>
  );
};

describe("LanguageContext", () => {
  beforeEach(() => {
    localStorage.clear();
    setNavigatorLanguage(["en-US"], "en-US");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "loc=US\n",
      }),
    );
  });

  it("defaults to English", async () => {
    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    expect(getByTestId("lang").textContent).toBe("en");
    expect(getByTestId("translated").textContent).toBe("Analytics");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses stored Thai preference before navigator and IP detection", async () => {
    localStorage.setItem("mf-lang", "th");
    setNavigatorLanguage(["en-US"], "en-US");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "loc=US\n",
      }),
    );

    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(getByTestId("lang").textContent).toBe("th");
    await waitFor(() => expect(getByTestId("translated").textContent).toBe("สถิติ"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses Thai when navigator language is th-TH", async () => {
    setNavigatorLanguage(["th-TH"], "th-TH");

    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(getByTestId("lang").textContent).toBe("th");
    await waitFor(() => expect(getByTestId("translated").textContent).toBe("สถิติ"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses Thai when IP country is Thailand", async () => {
    setNavigatorLanguage(["zz-ZZ"], "zz-ZZ");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "loc=TH\n",
      }),
    );

    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    await waitFor(() => expect(getByTestId("lang").textContent).toBe("th"));
    await waitFor(() => expect(getByTestId("translated").textContent).toBe("สถิติ"));
  });

  it("uses English when IP country is not mapped to a supported language", async () => {
    setNavigatorLanguage(["zz-ZZ"], "zz-ZZ");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "loc=DE\n",
      }),
    );

    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(getByTestId("lang").textContent).toBe("en");
    expect(getByTestId("translated").textContent).toBe("Analytics");
  });

  it("translates with parameter substitution", async () => {
    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    expect(getByTestId("with-params").textContent).toBe("Save 20%");
    expect(getByTestId("with-special-param").textContent).toBe("Upgrade to $&");
  });

  it("does not persist the initial fallback before IP detection resolves", () => {
    setNavigatorLanguage(["zz-ZZ"], "zz-ZZ");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    );

    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );

    expect(localStorage.getItem("mf-lang")).toBeNull();
  });

  it("switches language to Thai", async () => {
    const { getByTestId, getByText } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    await userEvent.click(getByText("Switch to TH"));
    expect(getByTestId("lang").textContent).toBe("th");
    await waitFor(() => expect(getByTestId("translated").textContent).toBe("สถิติ"));
    expect(localStorage.getItem("mf-lang")).toBe("th");
  });

  it("switches language back to English", async () => {
    localStorage.setItem("mf-lang", "th");
    const { getByTestId, getByText } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    await waitFor(() => expect(getByTestId("lang").textContent).toBe("th"));
    await userEvent.click(getByText("Switch to EN"));
    expect(getByTestId("lang").textContent).toBe("en");
    await waitFor(() => expect(getByTestId("translated").textContent).toBe("Analytics"));
    expect(localStorage.getItem("mf-lang")).toBe("en");
  });

  it("falls back to English when used outside provider", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getByTestId } = render(<TestConsumer />);
    expect(getByTestId("lang").textContent).toBe("en");
    expect(getByTestId("translated").textContent).toBe("Analytics");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("useLanguage called outside LanguageProvider"));
    spy.mockRestore();
  });
});
