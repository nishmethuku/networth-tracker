import Card from "./Card";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useToast } from "../contexts/ToastContext";

/** Install the app to the home screen. Hidden when it is already installed or unsupported. */
export default function InstallAppCard() {
  const toast = useToast();
  const { installed, canInstall, iosHint, install } = useInstallPrompt();
  if (installed || (!canInstall && !iosHint)) return null;

  return (
    <Card title="Install the app" subtitle="Open it from your home screen like any other app, full screen and fast.">
      {canInstall ? (
        <button
          type="button"
          onClick={async () => {
            const ok = await install();
            if (ok) toast.success("Installed");
          }}
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "var(--radius)",
            border: "none",
            background: "var(--primary)",
            color: "var(--text-inverse)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Install
        </button>
      ) : (
        <p style={{ marginTop: "0.75rem", color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
          In Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.
        </p>
      )}
    </Card>
  );
}
