import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import StatusEditor from "../StatusEditor";
import {StatusDraft} from "../StatusDraft";

const stockAssets = {
  graphics: {
    glow: {url: "/abilities/graphics/glow.webp"},
  },
};

describe("StatusEditor", () => {
  it("shows an Add status button when status is null", () => {
    render(<StatusEditor status={null} onAdd={() => {}} onChange={() => {}} />);
    expect(screen.getByRole("button", {name: "+ Add status"})).toBeInTheDocument();
  });

  it("calls onAdd when Add status is clicked", () => {
    const onAdd = vi.fn();
    render(<StatusEditor status={null} onAdd={onAdd} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", {name: "+ Add status"}));
    expect(onAdd).toHaveBeenCalled();
  });

  const statusData = {
    name: "Second Wind",
    shortName: "2ndWnd",
    description: "A burst of energy.",
    treatAs: "buff",
    stacking: "replace",
    effects: [{type: "stat", statName: "movementSpeed", modifierType: "multiply", amount: 1.2}],
  };

  it("renders the scalar fields as editable inputs", () => {
    render(<StatusEditor status={new StatusDraft(statusData)} onChange={() => {}} />);
    expect(screen.getByDisplayValue("Second Wind")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2ndWnd")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A burst of energy.")).toBeInTheDocument();
  });

  it("calls onChange with a StatusDraft reflecting the merged field when a scalar field changes", () => {
    const onChange = vi.fn();
    render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("Second Wind"), {target: {value: "Second Wind II"}});
    expect(onChange.mock.calls[0][0]).toBeInstanceOf(StatusDraft);
    expect(onChange.mock.calls[0][0].data).toEqual({...statusData, name: "Second Wind II"});
  });

  it("changing treatAs (a select) preserves sibling fields", () => {
    const onChange = vi.fn();
    render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("buff"), {target: {value: "debuff"}});
    expect(onChange.mock.calls[0][0].data).toEqual({...statusData, treatAs: "debuff"});
  });

  describe("auraEffect", () => {
    it("shows an Add aura effect button when absent", () => {
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={() => {}} />);
      expect(screen.getByRole("button", {name: "+ Add aura effect"})).toBeInTheDocument();
    });

    it("adds a blank auraEffect object, merged with the rest of the status, when clicked", () => {
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", {name: "+ Add aura effect"}));
      expect(onChange.mock.calls[0][0].data).toEqual({...statusData, auraEffect: {sourceURL: ""}});
    });

    it("renders auraEffect fields when present, and removes it via the Remove button", () => {
      const withAura = {...statusData, auraEffect: {sourceURL: "../graphics/effects/glow.webp", scale: 1.3, opacity: 0.5}};
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(withAura)} onChange={onChange} stockAssets={stockAssets} />);

      expect(screen.getByDisplayValue("../graphics/effects/glow.webp")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", {name: "Remove aura effect"}));
      expect(onChange.mock.calls[0][0].data.auraEffect).toBeNull();
    });

    it("picking a stock graphic sets sourceURL and sprite fields, clearing unset ones", () => {
      const withAura = {...statusData, auraEffect: {sourceURL: "../graphics/effects/glow.webp"}};
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(withAura)} onChange={onChange} stockAssets={stockAssets} />);

      fireEvent.change(screen.getByDisplayValue("— stock asset —"), {target: {value: "glow"}});

      const aura = onChange.mock.calls[0][0].data.auraEffect;
      expect(aura.sourceURL).toBe(":glow:");
      expect(aura.spriteColumns).toBeUndefined();
    });
  });

  describe("status effects list", () => {
    it("renders a stat-type effect's fields", () => {
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={() => {}} />);
      expect(screen.getByDisplayValue("movementSpeed")).toBeInTheDocument();
      expect(screen.getByDisplayValue("multiply")).toBeInTheDocument();
      expect(screen.getByDisplayValue("1.2")).toBeInTheDocument();
    });

    it("editing a stat effect field doesn't clobber sibling effects fields", () => {
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
      fireEvent.change(screen.getByDisplayValue("1.2"), {target: {value: "1.5"}});
      expect(onChange.mock.calls[0][0].data.effects).toEqual([
        {type: "stat", statName: "movementSpeed", modifierType: "multiply", amount: 1.5},
      ]);
    });

    it("adds a placeholder stat effect when Add status effect is clicked", () => {
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft({...statusData, effects: []})} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", {name: "+ Add status effect"}));
      expect(onChange.mock.calls[0][0].data.effects).toEqual([{type: "stat", statName: "damageDone", modifierType: "multiply", amount: 1.0}]);
    });

    it("switching a row's type to recurring replaces it with a recurring placeholder", () => {
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
      fireEvent.change(screen.getByDisplayValue("stat"), {target: {value: "recurring"}});
      expect(onChange.mock.calls[0][0].data.effects).toEqual([{type: "recurring", tickRate: 1.0, onTick: "heal", amount: 1.0}]);
    });

    it("removes a status effect row when its Remove button is clicked", () => {
      const onChange = vi.fn();
      render(<StatusEditor status={new StatusDraft(statusData)} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", {name: "Remove"}));
      expect(onChange.mock.calls[0][0].data.effects).toEqual([]);
    });
  });
});
