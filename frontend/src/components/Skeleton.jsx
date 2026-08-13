export default function Skeleton({ width = "100%", height = "1rem", radius = "var(--radius-sm)", style }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "linear-gradient(90deg, var(--bg-secondary) 25%, var(--border-light) 37%, var(--bg-secondary) 63%)",
        backgroundSize: "400% 100%",
        animation: "skeleton-shimmer 1.4s ease infinite",
        ...style,
      }}
    />
  );
}

if (typeof document !== "undefined" && !document.getElementById("skeleton-shimmer-keyframes")) {
  const style = document.createElement("style");
  style.id = "skeleton-shimmer-keyframes";
  style.textContent = `@keyframes skeleton-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }`;
  document.head.appendChild(style);
}
