import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AnnotationsSection from "../AnnotationsSection";

describe("AnnotationsSection", () => {
  it("shows nothing for a thing without annotations", () => {
    const {container} = render(<AnnotationsSection annotations={undefined} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    render(<AnnotationsSection annotations={{}} onChange={() => {}} />);
    expect(screen.queryByText("Annotations")).not.toBeInTheDocument();
  });

  it("edits each annotation's text, and offers no way to add one", () => {
    const onChange = vi.fn();
    render(<AnnotationsSection annotations={{plan: "A camp.", mood: "tense"}} onChange={onChange} />);
    expect(screen.getByLabelText("plan")).toHaveValue("A camp.");
    fireEvent.change(screen.getByLabelText("mood"), {target: {value: "calm"}});
    expect(onChange).toHaveBeenCalledWith({plan: "A camp.", mood: "calm"});
    expect(screen.queryByRole("button", {name: /add/i})).not.toBeInTheDocument();
  });

  it("removes one, and gives undefined once the last is gone", () => {
    const onChange = vi.fn();
    const {rerender} = render(<AnnotationsSection annotations={{plan: "A camp.", mood: "tense"}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", {name: "Remove annotation plan"}));
    expect(onChange).toHaveBeenLastCalledWith({mood: "tense"});
    rerender(<AnnotationsSection annotations={{mood: "tense"}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", {name: "Remove annotation mood"}));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
