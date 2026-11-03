import { useEffect, useRef } from "react";

// Follow the visible viewport when a phone keyboard opens, keeping the composer in view.
export function useChatViewport() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = ref.current?.closest<HTMLElement>(".app-main");
    const viewport = window.visualViewport;
    const resize = () => {
      shell?.style.setProperty(
        "--chat-viewport-height",
        String(Math.round(viewport?.height ?? window.innerHeight)) + "px",
      );
      shell?.classList.toggle(
        "chat-keyboard-open",
        !!viewport && window.innerHeight - viewport.height > 120,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      shell?.style.removeProperty("--chat-viewport-height");
      shell?.classList.remove("chat-keyboard-open");
    };
  }, []);
  return ref;
}
