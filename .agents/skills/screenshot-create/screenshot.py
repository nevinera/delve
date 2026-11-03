# Signs in to the local app, opens /create with a world zip, places the builder and saves a screenshot.
import argparse

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--world", required=True, help="world zip")
parser.add_argument("--out", required=True, help="PNG to write")
parser.add_argument("--at", help="x,z in continent feet")
parser.add_argument("--up", type=float, default=100, help="feet above the ground")
parser.add_argument("--eval", help="JavaScript to run before the screenshot")
parser.add_argument("--settle", type=float, default=20, help="seconds to let the ground draw")
parser.add_argument("--base", default="http://localhost:8000")
args = parser.parse_args()

# Headless Chromium refuses pointer lock, so the page gets a stand-in.
POINTER_LOCK = """
let locked = null;
Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event("pointerlockchange")); };
document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event("pointerlockchange")); };
Object.defineProperty(document, "pointerLockElement", { get: () => locked });
"""

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
    page.add_init_script(POINTER_LOCK)
    page.goto(f"{args.base}/login")
    page.locator("button:has-text('Sign in as')").first.click()
    page.wait_for_load_state()
    page.goto(f"{args.base}/create")
    page.wait_for_selector("#open:not([hidden])", timeout=60_000)
    page.set_input_files("#openFile", args.world)
    page.wait_for_function("window.create", timeout=300_000)
    if args.at:
        x, z = (float(n) for n in args.at.split(","))
        page.evaluate(
            """([x, z, up]) => {
              const { builder } = window.create;
              Object.assign(builder.state, { x, z, y: builder.standAt(x, z) + up });
            }""",
            [x, z, args.up],
        )
    page.wait_for_timeout(args.settle * 1000)
    if args.eval:
        page.evaluate(args.eval)
    page.screenshot(path=args.out)
    browser.close()
