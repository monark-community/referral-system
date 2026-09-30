// Purpose: Tests for the shared UI primitives - Button, Input, Label, Alert, and Spinner

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

describe("Button", () => {
  test("calls onClick and forwards its ref to the button element", async () => {
    const onClick = jest.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref} onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Save" }));
  });

  test("does not fire onClick while disabled", async () => {
    const onClick = jest.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  test("merges variant classes with custom classes", () => {
    render(<Button variant="destructive" className="w-full">Delete</Button>);

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button).toHaveClass("bg-destructive", "w-full");
  });
});

describe("Input", () => {
  test("shows the error message below the field", () => {
    render(<Input aria-label="Email" error="Email is required" />);

    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveClass("border-destructive");
  });

  test("renders no error text when there is no error", () => {
    const { container } = render(<Input aria-label="Email" />);

    expect(container.querySelector("p")).toBeNull();
  });
});

describe("Label", () => {
  test("marks required fields with an asterisk", () => {
    render(<Label required>Name</Label>);

    expect(screen.getByText("Name")).toHaveTextContent("Name*");
  });

  test("links to its input through htmlFor", () => {
    render(
      <>
        <Label htmlFor="phone">Phone</Label>
        <input id="phone" />
      </>,
    );

    expect(screen.getByLabelText("Phone")).toHaveAttribute("id", "phone");
  });
});

describe("Alert", () => {
  test("is announced as an alert with its message", () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Failed to update profile</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to update profile");
  });
});

describe("Spinner", () => {
  test("is exposed as a loading status", () => {
    render(<Spinner />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });
});
