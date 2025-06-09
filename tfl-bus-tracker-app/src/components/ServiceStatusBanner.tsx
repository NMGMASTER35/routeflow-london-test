import React, { useEffect, useState } from "react";
import { getServiceStatus } from "../api/tfl";

export default function ServiceStatusBanner() {
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    getServiceStatus().then(data => {
      const alert = data.find((l: any) => l.lineStatuses?.[0]?.statusSeverity !== 10);
      if (alert) setStatus(`⚠️ ${alert.name}: ${alert.lineStatuses[0].statusSeverityDescription}`);
    });
  }, []);

  if (!status) return null;
  return (
    <div className="service-status-banner">
      {status}
      <button className="dismiss">✕</button>
    </div>
  );
}
