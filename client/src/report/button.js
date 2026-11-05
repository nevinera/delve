import "./report.css";
import { MOST_SECONDS, blank, clock, noteWith, voiceType } from "./voice.js";

// A report button in the corner of every page: say what's wrong or what you wish you had, by
// typing or talking. It sends a screenshot of the page's biggest canvas, a voice note, what speech
// recognition heard (where the browser has it), the console lines the error recorder kept, and
// whatever the page says about itself through setReportContext.

/* global __BUILD__ */
const KINDS = [
  { id: "bug", icon: "🐞", label: "Something's broken" },
  { id: "object", icon: "🪨", label: "An object I wish I had" },
  { id: "template", icon: "🏠", label: "A structure I wish I had" },
  { id: "how", icon: "❓", label: "I can't work out how to do something" },
  { id: "annoying", icon: "😖", label: "Something's annoying" },
];
const SCREEN_WIDTH = 1280;
const STOP_WAIT_MS = 5000; // the longest send waits for a recording to finish

let context = () => ({});

// fn(): what the page wants a report to know, such as where its camera is.
export function setReportContext(fn) {
  context = fn;
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// The page's scene as a JPEG: its biggest canvas, where that fills most of the window, read in the
// frame after the page draws it, before it's cleared. Pages that don't draw every frame give a
// blank one, and that's left out.
function screenshot() {
  const area = (canvas) => {
    const box = canvas.getBoundingClientRect();
    return box.width * box.height;
  };
  const canvas = [...document.querySelectorAll("canvas")].sort((a, b) => area(b) - area(a))[0];
  if (!canvas?.width || area(canvas) < 0.5 * innerWidth * innerHeight) return Promise.resolve(null);
  return new Promise((done) => {
    requestAnimationFrame(() => {
      try {
        const scale = Math.min(1, SCREEN_WIDTH / canvas.width);
        const copy = el("canvas", { width: Math.round(canvas.width * scale), height: Math.round(canvas.height * scale) });
        const drawn = copy.getContext("2d");
        drawn.drawImage(canvas, 0, 0, copy.width, copy.height);
        if (blank(drawn.getImageData(0, 0, copy.width, copy.height).data)) return done(null);
        copy.toBlob(done, "image/jpeg", 0.8);
      } catch {
        done(null);
      }
    });
  });
}

function details() {
  let page = {};
  try {
    page = context() ?? {};
  } catch (err) {
    page = { contextError: err.message };
  }
  return {
    ...page,
    browser: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    lines: window.__errorRecorder?.lines ? [...window.__errorRecorder.lines] : [],
  };
}

function openReport() {
  const shot = screenshot();
  const facts = details();
  const dialog = el("dialog", { className: "report-dialog" });
  // Keys typed here are the note's, not the page's.
  for (const type of ["keydown", "keyup", "keypress"]) dialog.addEventListener(type, (event) => event.stopPropagation());
  const close = () => {
    stopVoice();
    dialog.close();
    dialog.remove();
  };
  dialog.addEventListener("cancel", close);

  let kind = null;
  let recorder = null;
  let recognizer = null;
  let voice = null;
  let stopped = null; // settles once the recorder has handed over the voice note
  let started = 0;
  let ticking = null;

  const title = el("h2", { textContent: "What do you want to tell us?" });
  const kinds = el("div", { className: "report-kinds" });
  const form = el("div", { className: "report-form", hidden: true });
  const note = el("textarea", { className: "report-note", rows: 4, placeholder: "Type here, or press the microphone and talk" });
  const mic = el("button", { type: "button", className: "report-mic", textContent: "🎤 talk" });
  const time = el("span", { className: "report-time" });
  const playback = el("audio", { controls: true, hidden: true });
  const status = el("p", { className: "report-status" });
  const send = el("button", { type: "button", className: "report-send", textContent: "send" });
  const back = el("button", { type: "button", textContent: "back" });
  const cancel = el("button", { type: "button", textContent: "cancel" });
  cancel.addEventListener("click", close);

  for (const each of KINDS) {
    const button = el("button", { type: "button", className: "report-kind" }, el("span", { className: "report-icon", textContent: each.icon }), el("span", { textContent: each.label }));
    button.addEventListener("click", () => {
      kind = each;
      title.textContent = `${each.icon} ${each.label}`;
      kinds.hidden = true;
      form.hidden = false;
      note.focus();
    });
    kinds.append(button);
  }
  back.addEventListener("click", () => {
    title.textContent = "What do you want to tell us?";
    kinds.hidden = false;
    form.hidden = true;
  });

  function stopVoice() {
    clearInterval(ticking);
    recognizer?.stop();
    if (recorder?.state === "recording") recorder.stop();
  }

  async function startVoice() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      status.textContent = "The microphone isn't allowed. You can still type.";
      return;
    }
    const type = voiceType((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
    const parts = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    let finished;
    stopped = new Promise((done) => (finished = done));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      voice = new Blob(parts, { type: recorder.mimeType || type || "audio/webm" });
      playback.src = URL.createObjectURL(voice);
      playback.hidden = false;
      mic.textContent = "🎤 talk again";
      mic.classList.remove("is-on");
      time.textContent = "";
      finished();
    };
    recorder.start();
    started = performance.now();
    mic.textContent = "⏹ stop";
    mic.classList.add("is-on");
    ticking = setInterval(() => {
      const seconds = (performance.now() - started) / 1000;
      time.textContent = clock(seconds);
      if (seconds >= MOST_SECONDS) stopVoice();
    }, 250);
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (Recognition) {
      const before = note.value;
      recognizer = new Recognition();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.onresult = (event) => (note.value = noteWith(before, event.results));
      recognizer.onerror = () => {};
      try {
        recognizer.start();
      } catch {
        recognizer = null;
      }
    }
  }

  mic.addEventListener("click", () => (recorder?.state === "recording" ? stopVoice() : startVoice()));

  send.addEventListener("click", async () => {
    stopVoice();
    // The recorder hands over the voice note a moment after it stops, longer in some browsers.
    if (stopped) await Promise.race([stopped, new Promise((done) => setTimeout(done, STOP_WAIT_MS))]);
    if (!note.value.trim() && !voice) {
      status.textContent = "Say or type something first.";
      return;
    }
    send.disabled = true;
    status.textContent = "Sending...";
    const body = new FormData();
    body.append("kind", kind.id);
    body.append("note", note.value);
    body.append("page", location.pathname + location.search);
    body.append("build", typeof __BUILD__ === "string" ? __BUILD__ : "");
    body.append("details", JSON.stringify(facts));
    if (voice) body.append("voice", voice, "voice");
    const image = await shot;
    if (image) body.append("screenshot", image, "screenshot.jpg");
    const token = document.querySelector("meta[name=csrf-token]")?.content ?? "";
    try {
      const response = await fetch("/problem_reports", { method: "POST", headers: { "X-CSRF-Token": token }, body });
      if (response.status === 401) throw new Error("you need to sign in first");
      if (!response.ok) throw new Error(`it didn't go (${response.status})`);
      status.textContent = "Sent. Thank you!";
      setTimeout(close, 1500);
    } catch (err) {
      status.textContent = `Not sent: ${err.message}`;
      send.disabled = false;
    }
  });

  form.append(note, el("div", { className: "report-voice" }, mic, time, playback), el("div", { className: "report-buttons" }, back, send));
  dialog.append(title, kinds, form, status, el("div", { className: "report-close" }, cancel));
  document.body.append(dialog);
  dialog.showModal();
}

if (typeof document !== "undefined") {
  const button = el("button", { type: "button", className: "report-button", title: "Report a problem or a wish", textContent: "💬" });
  button.setAttribute("aria-label", "report a problem or a wish");
  button.addEventListener("click", openReport);
  const add = () => document.body.append(button);
  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add);
}
