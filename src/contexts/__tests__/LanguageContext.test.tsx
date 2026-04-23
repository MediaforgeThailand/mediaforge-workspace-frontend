import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider, useLanguage } from "../LanguageContext";

const TestConsumer = () => {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="translated">{t("analytics")}</span>
      <span data-testid="with-params">{t("savePercent", { n: 20 })}</span>
      <button onClick={() => setLanguage("th")}>Switch to TH</button>
    </div>
  );
};

describe("LanguageContext", () => {
  it("defaults to English", () => {
    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    expect(getByTestId("lang").textContent).toBe("en");
    expect(getByTestId("translated").textContent).toBe("Analytics");
  });

  it("translates with parameter substitution", () => {
    const { getByTestId } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    expect(getByTestId("with-params").textContent).toBe("Save 20%");
  });

  it("switches language to Thai", async () => {
    const { getByTestId, getByText } = render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    );
    await userEvent.click(getByText("Switch to TH"));
    expect(getByTestId("lang").textContent).toBe("th");
    expect(getByTestId("translated").textContent).toBe("สถิติ");
  });

  it("throws when used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow("useLanguage must be used within LanguageProvider");
    spy.mockRestore();
  });
});
