import { useEffect, useState } from "react";
import Card from "./Card";
import { useToast } from "../contexts/ToastContext";
import { fetchPushVapidPublicKey, subscribeToPush, unsubscribeFromPush, sendTestPush, ApiError } from "../api";

const buttonStyle = {
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: "0.875rem",
  fontWeight: 500,
};

const primaryButtonStyle = { ...buttonStyle, background: "var(--primary)", color: "var(--text-inverse)", border: "none" };

// The browser's applicationServerKey option wants the VAPID public key as
// a raw Uint8Array, not the base64url string the backend/.env hands out.
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const SUPPORTED = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

/**
 * Lets the user turn on browser push notifications for triggered alerts, a
 * complement to the email alerts that already exist -- separate from
 * email because it needs its own explicit opt-in (browser permission
 * prompt) and only works in a context (this device/browser) email
 * doesn't share.
 */
export default function PushNotificationCard() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [vapidKey, setVapidKey] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!SUPPORTED) {
        setLoading(false);
        return;
      }
      const { configured: isConfigured, public_key } = await fetchPushVapidPublicKey();
      if (cancelled) return;
      setConfigured(isConfigured);
      setVapidKey(public_key);
      if (isConfigured) {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications permission was denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await subscribeToPush(subscription.toJSON());
      setSubscribed(true);
      toast.success("Push notifications are on");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't enable push notifications");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        toast.error("Not subscribed on this device");
        return;
      }
      await sendTestPush(subscription.endpoint);
      toast.success("Sent — should arrive any second");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send a test notification");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Push notifications are off");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't disable push notifications");
    } finally {
      setBusy(false);
    }
  }

  if (!SUPPORTED || loading) return null;
  if (!configured) return null;

  return (
    <Card title="Push Notifications">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          {subscribed
            ? "This browser will get a notification the moment an alert triggers, in addition to email."
            : "Get notified in this browser the moment an alert triggers, in addition to email."}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          {subscribed && (
            <button onClick={sendTest} disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}>
              Send test
            </button>
          )}
          <button
            onClick={subscribed ? disable : enable}
            disabled={busy}
            style={{ ...(subscribed ? buttonStyle : primaryButtonStyle), opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}
          >
            {busy ? "…" : subscribed ? "Disable" : "Enable"}
          </button>
        </div>
      </div>
    </Card>
  );
}
