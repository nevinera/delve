import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import DialogueFields, {deleteDialogueNode} from "../DialogueFields";

function openNode(preview) {
  fireEvent.click(screen.getByText(preview));
}

describe("DialogueFields", () => {
  it("adds a first node and marks it as an entry automatically", () => {
    const onChange = vi.fn();
    render(<DialogueFields dialogue={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ Add Node"));

    const call = onChange.mock.calls[0][0];
    expect(call.entry).toHaveLength(1);
    expect(Object.keys(call.nodes)).toEqual(call.entry.map((e) => e.node));
    expect(call.nodes[call.entry[0].node]).toEqual({text: ""});
  });

  it("does not auto-enter a second node", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi."}}};
    const onChange = vi.fn();
    render(<DialogueFields dialogue={dialogue} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ Add Node"));

    const call = onChange.mock.calls[0][0];
    expect(call.entry).toEqual([{node: "a"}]);
    expect(Object.keys(call.nodes)).toHaveLength(2);
  });

  it("edits a node's text and toggles it into the entry list", () => {
    const dialogue = {entry: [], nodes: {a: {text: "Hi."}}};
    const onChange = vi.fn();
    render(<DialogueFields dialogue={dialogue} onChange={onChange} />);

    openNode("Hi.");
    fireEvent.change(screen.getByLabelText("Node text"), {target: {value: "Hello."}});
    expect(onChange).toHaveBeenLastCalledWith({entry: [], nodes: {a: {text: "Hello."}}});

    fireEvent.click(screen.getByLabelText("Possible starting line"));
    expect(onChange).toHaveBeenLastCalledWith({entry: [{node: "a"}], nodes: {a: {text: "Hi."}}});
  });

  it("sets a linear next target via the dropdown", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi."}, b: {text: "Bye."}}};
    const onChange = vi.fn();
    render(<DialogueFields dialogue={dialogue} onChange={onChange} />);

    openNode("Hi.");
    fireEvent.change(screen.getByLabelText("Continues to"), {target: {value: "b"}});
    expect(onChange).toHaveBeenLastCalledWith({
      entry: [{node: "a"}],
      nodes: {a: {text: "Hi.", next: "b", choices: undefined}, b: {text: "Bye."}},
    });
  });

  it("switches a node to choices, adds a choice, and sets its target", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi."}, b: {text: "Bye."}}};
    const onChange = vi.fn();
    const {rerender} = render(<DialogueFields dialogue={dialogue} onChange={onChange} />);

    openNode("Hi.");
    fireEvent.click(screen.getByLabelText("Player chooses"));
    let next = onChange.mock.calls.at(-1)[0];
    expect(next.nodes.a.choices).toEqual([{text: "", next: undefined}]);
    rerender(<DialogueFields dialogue={next} onChange={onChange} />);

    fireEvent.click(screen.getByText("+ Add Choice"));
    next = onChange.mock.calls.at(-1)[0];
    expect(next.nodes.a.choices).toHaveLength(2);
    rerender(<DialogueFields dialogue={next} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Choice 1 text"), {target: {value: "Why?"}});
    next = onChange.mock.calls.at(-1)[0];
    expect(next.nodes.a.choices[0].text).toBe("Why?");
    rerender(<DialogueFields dialogue={next} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Choice 1 target"), {target: {value: "b"}});
    next = onChange.mock.calls.at(-1)[0];
    expect(next.nodes.a.choices[0].next).toBe("b");
  });

  it("flags a choice with no target as a dead end", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi.", choices: [{text: "Ok", next: undefined}]}}};
    render(<DialogueFields dialogue={dialogue} onChange={vi.fn()} />);
    openNode("Hi.");
    expect(screen.getByTitle("This choice ends the conversation")).toBeInTheDocument();
  });

  it("removes a choice", () => {
    const dialogue = {
      entry: [{node: "a"}],
      nodes: {a: {text: "Hi.", choices: [{text: "One", next: undefined}, {text: "Two", next: undefined}]}},
    };
    const onChange = vi.fn();
    render(<DialogueFields dialogue={dialogue} onChange={onChange} />);
    openNode("Hi.");
    fireEvent.click(screen.getByLabelText("Remove choice 1"));
    expect(onChange).toHaveBeenLastCalledWith({
      entry: [{node: "a"}],
      nodes: {a: {text: "Hi.", choices: [{text: "Two", next: undefined}]}},
    });
  });

  it("drops the field entirely once the last node is removed", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi."}}};
    const onChange = vi.fn();
    render(<DialogueFields dialogue={dialogue} onChange={onChange} />);
    openNode("Hi.");
    fireEvent.click(screen.getByText("Remove"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("deleteDialogueNode", () => {
  it("removes the node and strips it from entry", () => {
    const dialogue = {entry: [{node: "a"}, {node: "b"}], nodes: {a: {text: "Hi."}, b: {text: "Bye."}}};
    expect(deleteDialogueNode(dialogue, "a")).toEqual({entry: [{node: "b"}], nodes: {b: {text: "Bye."}}});
  });

  it("clears a dangling linear next reference to the deleted node", () => {
    const dialogue = {entry: [{node: "a"}], nodes: {a: {text: "Hi.", next: "b"}, b: {text: "Bye."}}};
    const result = deleteDialogueNode(dialogue, "b");
    expect(result.nodes.a).toEqual({text: "Hi.", next: undefined});
  });

  it("clears a dangling choice next reference to the deleted node, keeping the choice", () => {
    const dialogue = {
      entry: [{node: "a"}],
      nodes: {a: {text: "Hi.", choices: [{text: "Go", next: "b"}, {text: "Stay", next: "a"}]}, b: {text: "Bye."}},
    };
    const result = deleteDialogueNode(dialogue, "b");
    expect(result.nodes.a.choices).toEqual([{text: "Go", next: undefined}, {text: "Stay", next: "a"}]);
  });
});
