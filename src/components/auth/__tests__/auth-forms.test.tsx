import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(async () => ({})),
  signUpAction: vi.fn(async () => ({})),
  signInWithProviderAction: vi.fn(),
}));

const { LoginForm } = await import("@/components/auth/LoginForm");
const { SignupForm } = await import("@/components/auth/SignupForm");
const { OAuthButtons } = await import("@/components/auth/OAuthButtons");

describe("LoginForm", () => {
  it("renders credentials fields and carries the next path", () => {
    render(<LoginForm next="/tambayan/abc" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(document.querySelector("input[name=next]")).toHaveAttribute("value", "/tambayan/abc");
    expect(screen.getByRole("link", { name: "Gumawa ng account" })).toHaveAttribute("href", "/signup?next=%2Ftambayan%2Fabc");
  });

  it("shows errors passed from the callback", () => {
    render(<LoginForm next="/tambayan" initialError="Nag-expire ang link." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nag-expire ang link.");
  });
});

describe("SignupForm", () => {
  it("asks for display name, username, email and password", () => {
    render(<SignupForm />);
    for (const label of ["Display name", "Username", "Email", "Password"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sali na!" })).toBeInTheDocument();
  });
});

describe("OAuthButtons", () => {
  it("renders one form per enabled provider", () => {
    render(<OAuthButtons providers={["github", "discord"]} next="/x" />);
    expect(screen.getByRole("button", { name: /GitHub/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Discord/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  it("renders nothing when OAuth is disabled", () => {
    const { container } = render(<OAuthButtons providers={[]} next="/x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
