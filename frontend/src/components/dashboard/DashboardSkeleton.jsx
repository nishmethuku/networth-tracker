import Skeleton from "../Skeleton";
import Card from "../Card";
import useIsMobile from "../../hooks/useIsMobile";

export default function DashboardSkeleton() {
  const isMobile = useIsMobile();
  return (
    <div>
      <Skeleton width="180px" height="2rem" style={{ marginBottom: "1.5rem" }} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton width="90px" height="0.8rem" style={{ marginBottom: "0.75rem" }} />
            <Skeleton width="130px" height="1.75rem" />
          </Card>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <Card>
          <Skeleton width="100%" height="280px" radius="var(--radius)" />
        </Card>
        <Card>
          <Skeleton width="100%" height="280px" radius="50%" style={{ maxWidth: 280, margin: "0 auto" }} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {[0, 1].map((i) => (
          <Card key={i}>
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <Skeleton width="100px" height="0.875rem" />
                <Skeleton width="60px" height="0.875rem" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
