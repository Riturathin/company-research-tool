import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => []
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a useful empty state when there are no saved reports", async () => {
    render(<App />);
    expect(await screen.findByText("Briefings")).toBeInTheDocument();
    expect(screen.getByText("No saved reports yet. Research a company to build your first briefing.")).toBeInTheDocument();
    expect(screen.getByText("Walk into the next call prepared.")).toBeInTheDocument();
  });

  it("handles invalid input without calling the research endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<App />);
    await screen.findByText("Briefings");

    fireEvent.change(screen.getByPlaceholderText("Research a company..."), { target: { value: "!!!" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    expect(screen.getByText("Check the company name:")).toBeInTheDocument();
    expect(screen.getByText("Enter a real company name, such as Stripe or Microsoft.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
