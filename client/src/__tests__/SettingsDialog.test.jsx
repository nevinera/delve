import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsDialog, { sensitivityToSlider, sliderToSensitivity } from "../SettingsDialog";

const powers = Array.from({ length: 10 }, (_, i) => ({ name: `Power ${i + 1}` }));
const layout = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function renderDialog(props = {}) {
  const handlers = { onAssign: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), onToggleLatency: vi.fn(), onReload: vi.fn() };
  render(<SettingsDialog open powers={powers} layout={layout} {...handlers} {...props} />);
  return handlers;
}

describe("SettingsDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<SettingsDialog open={false} powers={powers} layout={layout} />);
    expect(container).toBeEmptyDOMElement();
  });

  function openAbilities() { fireEvent.click(screen.getByText("Remap abilities")); }

  it("starts on a menu listing the panes, not the remap controls", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Remap abilities")).toBeTruthy();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("offers latency toggle and reload actions on the menu", () => {
    const { onToggleLatency, onReload } = renderDialog();
    fireEvent.click(screen.getByText("Toggle latency display (L)"));
    fireEvent.click(screen.getByText("Reload"));
    expect(onToggleLatency).toHaveBeenCalled();
    expect(onReload).toHaveBeenCalled();
  });

  it("replaces the menu with the remap pane, and Back returns to it", () => {
    renderDialog();
    openAbilities();
    expect(screen.getByRole("dialog", { name: "Remap abilities" })).toBeTruthy();
    expect(screen.getAllByRole("combobox")).toHaveLength(10);
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("shows one select per button with the current power selected", () => {
    renderDialog({ layout: [3, 1, 2, 0, 4, 5, 6, 7, 8, 9] });
    openAbilities();
    expect(screen.getAllByRole("combobox")).toHaveLength(10);
    expect(screen.getByLabelText("Button 1").value).toBe("3");
  });

  it("reports the chosen power for a button", () => {
    const { onAssign } = renderDialog();
    openAbilities();
    fireEvent.change(screen.getByLabelText("Button 2"), { target: { value: "5" } });
    expect(onAssign).toHaveBeenCalledWith(1, 5);
  });

  it("wires reset and close and shows errors", () => {
    const { onReset, onClose } = renderDialog({ error: "nope" });
    openAbilities();
    fireEvent.click(screen.getByText("Reset to default"));
    fireEvent.click(screen.getByText("Close"));
    expect(onReset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText("nope")).toBeTruthy();
  });

  it("edits camera sensitivity from its own pane, with 1x at the slider's center", () => {
    const onCameraSensitivityChange = vi.fn();
    renderDialog({ cameraSensitivity: 1, onCameraSensitivityChange });
    fireEvent.click(screen.getByText("Camera sensitivity"));
    expect(screen.getByRole("dialog", { name: "Camera sensitivity" })).toBeTruthy();
    expect(Number(screen.getByRole("slider").value)).toBe(0);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(onCameraSensitivityChange).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "-1" } });
    expect(onCameraSensitivityChange).toHaveBeenCalledWith(0.5);
    fireEvent.click(screen.getByText("Reset to default"));
    expect(onCameraSensitivityChange).toHaveBeenCalledWith(1);
  });
});

describe("sensitivity slider mapping", () => {
  it("maps 0.5x/1x/2x to -1/0/1 and round-trips", () => {
    expect(sensitivityToSlider(0.5)).toBe(-1);
    expect(sensitivityToSlider(1)).toBe(0);
    expect(sensitivityToSlider(2)).toBe(1);
    expect(sliderToSensitivity(sensitivityToSlider(1.5))).toBe(1.5);
  });

  it("clamps out-of-range saved values", () => {
    expect(sensitivityToSlider(3)).toBe(1);
    expect(sensitivityToSlider(0.1)).toBe(-1);
  });
});
