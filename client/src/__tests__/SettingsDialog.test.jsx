import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEFAULT_HOTKEYS } from "../hotkeys";
import SettingsDialog, { sensitivityToSlider, sliderToSensitivity } from "../SettingsDialog";

const powers = Array.from({ length: 10 }, (_, i) => ({ name: `Power ${i + 1}` }));
const layout = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function renderDialog(props = {}) {
  const handlers = { onAssign: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), onToggleLatency: vi.fn(), onReload: vi.fn(), onSaveHotkeys: vi.fn().mockResolvedValue(null) };
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

describe("SettingsDialog hotkeys pane", () => {
  function openHotkeys(props = {}) {
    const handlers = renderWith(props);
    fireEvent.click(screen.getByText("Hotkeys"));
    return handlers;
  }
  function renderWith(props) {
    const handlers = { onAssign: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), onSaveHotkeys: vi.fn().mockResolvedValue(null) };
    render(<SettingsDialog open powers={powers} layout={layout} hotkeys={{ ...DEFAULT_HOTKEYS }} {...handlers} {...props} />);
    return handlers;
  }
  const press = (code, extra = {}) => fireEvent.keyDown(window, { code, ...extra });

  it("lists every action with its binding, and starts with Save disabled", () => {
    openHotkeys();
    expect(screen.getByLabelText("Bind Move forward").textContent).toBe("W");
    expect(screen.getByLabelText("Bind Stop attacking").textContent).toBe("Shift+T");
    expect(screen.getByText("Save").disabled).toBe(true);
  });

  it("captures the next keypress as the new binding", () => {
    openHotkeys();
    fireEvent.click(screen.getByLabelText("Bind Move forward"));
    expect(screen.getByLabelText("Bind Move forward").textContent).toBe("Press a key...");
    press("ArrowUp");
    expect(screen.getByLabelText("Bind Move forward").textContent).toBe("up");
    expect(screen.getByText("Save").disabled).toBe(false);
  });

  it("captures shift as an s+ prefix and ignores lone modifiers", () => {
    openHotkeys();
    fireEvent.click(screen.getByLabelText("Bind Toggle latency display"));
    press("ShiftLeft", { shiftKey: true });
    expect(screen.getByLabelText("Bind Toggle latency display").textContent).toBe("Press a key...");
    press("KeyK", { shiftKey: true });
    expect(screen.getByLabelText("Bind Toggle latency display").textContent).toBe("Shift+K");
  });

  it("cancels a capture on Escape without changing anything", () => {
    openHotkeys();
    fireEvent.click(screen.getByLabelText("Bind Move forward"));
    press("Escape");
    expect(screen.getByLabelText("Bind Move forward").textContent).toBe("W");
  });

  it("blocks saving while two actions share a key", () => {
    openHotkeys();
    fireEvent.click(screen.getByLabelText("Bind Ability button 2"));
    press("Digit1");
    expect(screen.getByText("Each action needs its own key.")).toBeTruthy();
    expect(screen.getByText("Save").disabled).toBe(true);
  });

  it("saves the whole draft, then returns to the menu", async () => {
    const { onSaveHotkeys } = openHotkeys();
    fireEvent.click(screen.getByLabelText("Bind Move forward"));
    press("ArrowUp");
    fireEvent.click(screen.getByText("Save"));
    await screen.findByRole("dialog", { name: "Settings" });
    expect(onSaveHotkeys).toHaveBeenCalledWith({ ...DEFAULT_HOTKEYS, move_forward: "up" });
  });

  it("shows a save error and stays on the pane", async () => {
    openHotkeys({ onSaveHotkeys: vi.fn().mockResolvedValue("Failed to save settings (422)") });
    fireEvent.click(screen.getByLabelText("Bind Move forward"));
    press("ArrowUp");
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("Failed to save settings (422)")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Hotkeys" })).toBeTruthy();
  });

  it("resets the draft to the defaults", () => {
    openHotkeys({ hotkeys: { ...DEFAULT_HOTKEYS, move_forward: "up" } });
    fireEvent.click(screen.getByText("Reset to default"));
    expect(screen.getByLabelText("Bind Move forward").textContent).toBe("W");
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
