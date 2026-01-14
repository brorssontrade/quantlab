import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import SearchableSelect from "../SearchableSelect";

const OPTIONS = [
  { value: "ABB.ST", label: "ABB.ST", description: "ABB" },
  { value: "VOLV-B.ST", label: "VOLV-B.ST", description: "Volvo" },
  { value: "INVE-B.ST", label: "INVE-B.ST", description: "Investor" },
];

function ControlledSelect(props: {
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <SearchableSelect
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      onSubmit={(next) => {
        setValue(next);
        props.onSubmit?.(next);
      }}
      options={OPTIONS}
      inputPlaceholder="Sök"
    />
  );
}

describe("SearchableSelect", () => {
  it("allows keyboard selection via arrow keys", async () => {
    const onChange = vi.fn();
    render(<ControlledSelect onChange={onChange} />);
    const [input] = screen.getAllByPlaceholderText("Sök");
    const user = userEvent.setup();

    input.focus();
    await user.type(input, "a");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("ABB.ST");
    expect(screen.getByDisplayValue("ABB.ST")).toBeInTheDocument();
  });

  it("submits free text when option is absent", async () => {
    const onSubmit = vi.fn();
    render(<ControlledSelect onSubmit={onSubmit} />);
    const [input] = screen.getAllByPlaceholderText("Sök");
    const user = userEvent.setup();

    input.focus();
    await user.type(input, "XYZ.ST");
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("XYZ.ST");
  });
});
