import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup?next=%2Ftambayan%2Fabc");
  });

  it("shows errors passed from the callback", () => {
    render(<LoginForm next="/tambayan" initialError="Nag-expire ang link." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nag-expire ang link.");
  });

  it("shows and hides the password with the eye toggle, keeping what was typed", () => {
    render(<LoginForm next="/tambayan" />);
    const password = screen.getByLabelText("Password");
    fireEvent.change(password, { target: { value: "Kape-Muna-2026" } });
    expect(password).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button"); // never submits the form
    expect(toggle).toHaveAttribute("aria-controls", password.id);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("Kape-Muna-2026");
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(password).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBe(toggle);
    // The email field is not a password: no toggle there.
    expect(screen.getAllByRole("button", { name: /password$/ })).toHaveLength(1);
  });
});

describe("SignupForm", () => {
  it("asks for display name, username, email and password", () => {
    render(<SignupForm />);
    for (const label of ["Display name", "Username", "Email", "Password", "Confirm password"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("name", "confirmPassword");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("flags mismatched confirmation live and blocks submit until it matches", () => {
    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Kape-Muna-2026" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Kape-Muna-202" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords don't match");
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Kape-Muna-2026" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Passwords match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeEnabled();
  });
});

describe("SignupForm password toggles", () => {
  it("gives each password field its own independent toggle", () => {
    render(<SignupForm />);
    const [first, second] = screen.getAllByRole("button", { name: "Show password" });
    fireEvent.click(second);
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    fireEvent.click(first);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
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
