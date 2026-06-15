import React, { useState, useEffect } from "react";

function CountdownTimer({ createdAt, timeout }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const totalMs = timeout * 1000;
    const elapsed = Date.now() - createdAt;
    setRemaining(Math.max(0, totalMs - elapsed));

    const interval = setInterval(() => {
      const elapsed = Date.now() - createdAt;
      const left = Math.max(0, totalMs - elapsed);
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [createdAt, timeout]);

  const seconds = Math.ceil(remaining / 1000);
  const isUrgent = seconds <= 3;

  return (
    <span className={`countdown ${isUrgent ? "countdown--urgent" : "countdown--normal"}`}>
      {seconds}s
    </span>
  );
}

export default React.memo(CountdownTimer);
