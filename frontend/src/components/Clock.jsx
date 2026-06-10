import React, { useState, useEffect } from "react";

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");

  return (
    <span className="clock" style={{ fontFamily: "var(--bs-font-monospace)", fontSize: "0.85rem", color: "#c9d1d9" }}>
      {hh}:{mm}:{ss}
    </span>
  );
}

export default React.memo(Clock);
