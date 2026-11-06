import { HeartPulse } from "lucide-react";
export function Brand({ light = false }) {
  return (
    <div className={`brand ${light ? "light" : ""}`}>
      <span className="brand-icon">
        <HeartPulse size={25} />
      </span>
      <div>
        <strong>Santa Casa</strong>
        <span>DE PELOTAS</span>
      </div>
    </div>
  );
}
