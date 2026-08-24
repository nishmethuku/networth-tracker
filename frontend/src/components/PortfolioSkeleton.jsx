import Skeleton from "./Skeleton";
import Card from "./Card";

export default function PortfolioSkeleton() {
  return (
    <div>
      <Skeleton width="140px" height="2rem" style={{ marginBottom: "1.5rem" }} />
      <Skeleton width="100px" height="1.25rem" style={{ marginBottom: "0.75rem" }} />
      <Card>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 0",
              borderBottom: i < 3 ? "1px solid var(--border-light)" : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <Skeleton width="120px" height="0.9375rem" />
              <Skeleton width="80px" height="0.75rem" />
            </div>
            <Skeleton width="90px" height="0.9375rem" />
          </div>
        ))}
      </Card>
    </div>
  );
}
