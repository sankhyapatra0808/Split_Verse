import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { topProgressEvents } from "../utils/topProgress";
import "../styles/TopProgressBar.css";

const dashboardRoutes = new Set([
  "/dashboard",
  "/split-rooms",
  "/wallet",
  "/wallet-top-up",
  "/transactions",
  "/friends",
  "/settings",
]);

type TopProgressEvent = CustomEvent<{ id?: string }>;

export default function TopProgressBar() {
  const location = useLocation();
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const visibleRef = useRef(visible);
  const finishingRef = useRef(finishing);
  const insideDashboard = dashboardRoutes.has(location.pathname);
  const activeCount = activeIds.size;

  useEffect(() => {
    visibleRef.current = visible;
    finishingRef.current = finishing;
  }, [finishing, visible]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const progressId = (event as TopProgressEvent).detail?.id;

      if (!progressId) {
        return;
      }

      setFinishing(false);
      setVisible(true);
      setActiveIds((currentIds) => {
        if (currentIds.size === 0 && !visibleRef.current) {
          setProgress(0);
        } else if (currentIds.size === 0 && finishingRef.current) {
          setProgress((current) => Math.min(current, 92));
        }

        const nextIds = new Set(currentIds);
        nextIds.add(progressId);
        return nextIds;
      });
    };
    const handleEnd = (event: Event) => {
      const progressId = (event as TopProgressEvent).detail?.id;

      if (!progressId) {
        return;
      }

      setActiveIds((currentIds) => {
        if (!currentIds.has(progressId)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.delete(progressId);
        return nextIds;
      });
    };

    window.addEventListener(topProgressEvents.start, handleStart);
    window.addEventListener(topProgressEvents.end, handleEnd);

    return () => {
      window.removeEventListener(topProgressEvents.start, handleStart);
      window.removeEventListener(topProgressEvents.end, handleEnd);
    };
  }, []);

  useEffect(() => {
    if (activeCount <= 0 || !visible || finishing) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }

        const nextStep = Math.max(0.16, (92 - current) * 0.035);
        return Math.min(92, current + nextStep);
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [activeCount, finishing, visible]);

  useEffect(() => {
    if (activeCount > 0 || !visible) {
      return;
    }

    const finishTimer = window.setTimeout(() => {
      setFinishing(true);
      setProgress(100);
    }, 0);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setFinishing(false);
      setProgress(0);
    }, 320);

    return () => {
      window.clearTimeout(finishTimer);
      window.clearTimeout(hideTimer);
    };
  }, [activeCount, visible]);

  if (!visible) {
    return null;
  }
  return (
    <span
      className={[
        "top-progress-bar",
        insideDashboard ? "dashboard-progress" : "",
        finishing ? "finishing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    >
      <i style={{ width: `${progress}%` }} />
    </span>
  );
}
