"use client";

import {
  useEffect,
  useState
} from "react";

type InstallPromptEvent =
  Event & {
    prompt: () => Promise<void>;

    userChoice: Promise<{
      outcome:
        | "accepted"
        | "dismissed";

      platform: string;
    }>;
  };

export function PwaRegister() {
  const [
    installPrompt,
    setInstallPrompt
  ] = useState<
    InstallPromptEvent | null
  >(null);

  useEffect(() => {
    if (
      process.env.NODE_ENV ===
        "production" &&
      "serviceWorker" in navigator
    ) {
      void navigator
        .serviceWorker
        .register(
          "/sw.js",
          {
            scope: "/",
            updateViaCache:
              "none"
          }
        );
    }

    function handleInstallPrompt(
      event: Event
    ) {
      event.preventDefault();

      setInstallPrompt(
        event as
          InstallPromptEvent
      );
    }

    function handleInstalled() {
      setInstallPrompt(null);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleInstalled
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleInstalled
      );
    };
  }, []);

  if (!installPrompt) {
    return null;
  }

  async function install() {
    await installPrompt?.prompt();
    await installPrompt?.userChoice;

    setInstallPrompt(null);
  }

  return (
    <button
      type="button"
      onClick={install}
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        minHeight: 46,
        border:
          "1px solid #d9ff38",
        padding: "0 18px",
        background: "#d9ff38",
        color: "#070a0f",
        fontWeight: 900,
        letterSpacing: "0.04em",
        cursor: "pointer",
        boxShadow:
          "0 14px 36px rgba(0,0,0,0.45)"
      }}
    >
      INSTALLER GOALX
    </button>
  );
}
