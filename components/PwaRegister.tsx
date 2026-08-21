"use client";

import {
  useEffect,
  useState
} from "react";

import {
  Download,
  Share2,
  X
} from "lucide-react";

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

type NavigatorWithStandalone =
  Navigator & {
    standalone?: boolean;
  };

function isStandalone(): boolean {
  if (
    typeof window === "undefined"
  ) {
    return false;
  }

  return (
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||
    (
      window.navigator as
        NavigatorWithStandalone
    ).standalone === true
  );
}

export function PwaRegister() {
  const [
    installPrompt,
    setInstallPrompt
  ] = useState<
    InstallPromptEvent | null
  >(null);

  const [
    isIos,
    setIsIos
  ] = useState(false);

  const [
    showIosHelp,
    setShowIosHelp
  ] = useState(false);

  const [
    hidden,
    setHidden
  ] = useState(true);

  useEffect(() => {
    const installed =
      isStandalone();

    const userAgent =
      window.navigator.userAgent;

    const iosDevice =
      /iPhone|iPad|iPod/i.test(
        userAgent
      );

    setIsIos(iosDevice);

    if (installed) {
      setHidden(true);
    }

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
        )
        .catch((error) => {
          console.error(
            "GOALX_SERVICE_WORKER_ERROR",
            error
          );
        });
    }

    function handleInstallPrompt(
      event: Event
    ) {
      event.preventDefault();

      setInstallPrompt(
        event as
          InstallPromptEvent
      );

      setHidden(false);
    }

    function handleInstalled() {
      setInstallPrompt(null);
      setShowIosHelp(false);
      setHidden(true);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleInstalled
    );

    if (
      iosDevice &&
      !installed
    ) {
      setHidden(false);
    }

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

  async function install() {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }

    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();

    const choice =
      await installPrompt.userChoice;

    if (
      choice.outcome ===
      "accepted"
    ) {
      setHidden(true);
    }

    setInstallPrompt(null);
  }

  if (hidden) {
    return null;
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          right: 14,
          bottom: 14,
          left: 14,
          zIndex: 1000,
          width:
            "min(calc(100% - 28px), 390px)",
          marginLeft: "auto",
          overflow: "hidden",
          border:
            "1px solid rgba(242, 56, 47, 0.5)",
          borderRadius: 8,
          background:
            "linear-gradient(135deg, #191415, #101011 68%)",
          boxShadow:
            "0 20px 60px rgba(0, 0, 0, 0.6)"
        }}
      >
        <button
          type="button"
          onClick={() => {
            setHidden(true);
          }}
          aria-label="Fermer"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            width: 32,
            height: 32,
            display: "grid",
            placeItems: "center",
            border:
              "1px solid #343437",
            borderRadius: 5,
            padding: 0,
            background: "#19191b",
            color: "#8d8d8a",
            cursor: "pointer"
          }}
        >
          <X
            width={16}
            height={16}
          />
        </button>

        <div
          style={{
            padding:
              "20px 50px 16px 18px"
          }}
        >
          <span
            style={{
              color: "#f2382f",
              fontSize: "0.62rem",
              fontWeight: 900,
              letterSpacing: "0.12em",
              textTransform:
                "uppercase"
            }}
          >
            Application GOALX
          </span>

          <strong
            style={{
              display: "block",
              marginTop: 5,
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 950,
              textTransform:
                "uppercase"
            }}
          >
            Installe GOALX
          </strong>

          <p
            style={{
              margin:
                "7px 0 15px",
              color: "#989895",
              fontSize: "0.72rem",
              lineHeight: 1.5
            }}
          >
            Accède rapidement à tes
            matchs depuis ton écran
            d’accueil.
          </p>

          <button
            type="button"
            onClick={install}
            style={{
              width: "100%",
              minHeight: 46,
              display: "flex",
              alignItems: "center",
              justifyContent:
                "center",
              gap: 9,
              border:
                "1px solid #f2382f",
              borderRadius: 5,
              padding: "0 16px",
              background: "#f2382f",
              color: "#ffffff",
              fontSize: "0.72rem",
              fontWeight: 950,
              letterSpacing:
                "0.065em",
              textTransform:
                "uppercase",
              cursor: "pointer"
            }}
          >
            <Download
              width={18}
              height={18}
            />

            Installer GOALX
          </button>
        </div>
      </div>

      {showIosHelp ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Installer GOALX sur iPhone"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            display: "grid",
            placeItems: "center",
            padding: 20,
            background:
              "rgba(0, 0, 0, 0.78)"
          }}
        >
          <div
            style={{
              width:
                "min(100%, 390px)",
              border:
                "1px solid #343437",
              borderRadius: 8,
              padding: 24,
              background: "#121213",
              boxShadow:
                "0 25px 70px rgba(0, 0, 0, 0.7)"
            }}
          >
            <Share2
              width={28}
              height={28}
              color="#f2382f"
            />

            <strong
              style={{
                display: "block",
                margin:
                  "14px 0 9px",
                color: "#ffffff",
                fontSize: "1rem",
                fontWeight: 950,
                textTransform:
                  "uppercase"
              }}
            >
              Installer sur iPhone
            </strong>

            <p
              style={{
                margin: 0,
                color: "#a0a09d",
                fontSize: "0.78rem",
                lineHeight: 1.65
              }}
            >
              Dans Safari, appuie sur
              Partager, puis choisis
              « Sur l’écran d’accueil ».
            </p>

            <button
              type="button"
              onClick={() => {
                setShowIosHelp(
                  false
                );
              }}
              style={{
                width: "100%",
                minHeight: 44,
                marginTop: 19,
                border:
                  "1px solid #3a3a3e",
                borderRadius: 5,
                background:
                  "#1a1a1c",
                color: "#ffffff",
                fontWeight: 900,
                cursor: "pointer",
                textTransform:
                  "uppercase"
              }}
            >
              Compris
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
      }
