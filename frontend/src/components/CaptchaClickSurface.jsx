import React, { useRef, useState } from "react";
import {
  getImageClickCoordinates,
  getMarkerColor,
  getVisibleCaptchaIcons,
} from "./captchaClickGeometry";

export function CaptchaClickSurface({
  image,
  markers = [],
  disabled = false,
  alt = "Капча",
  className = "",
  imageClassName = "",
  emptyContent = null,
  onCoordinateClick,
}) {
  const imgRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);

  const handleLoad = (event) => {
    setNaturalSize({
      w: event.target.naturalWidth,
      h: event.target.naturalHeight,
    });
  };

  const handleClick = (event) => {
    if (disabled || !onCoordinateClick) return;
    const coords = getImageClickCoordinates({
      event,
      imageElement: imgRef.current,
      naturalSize,
    });
    if (coords) onCoordinateClick(coords, event);
  };

  if (!image) return emptyContent;

  return (
    <div className={`captcha-click-surface ${disabled ? "is-disabled" : ""} ${className}`}>
      <img
        ref={imgRef}
        src={"data:image/png;base64," + image}
        alt={alt}
        onLoad={handleLoad}
        onClick={handleClick}
        className={`captcha-click-surface__image ${imageClassName}`}
        draggable={false}
      />
      {naturalSize && markers.map((marker, index) => {
        const label = marker.label != null ? marker.label : index + 1;
        return (
          <div
            key={`${marker.x}-${marker.y}-${label}-${index}`}
            className="captcha-click-surface__marker"
            style={{
              left: `${((marker.x / naturalSize.w) * 100).toFixed(2)}%`,
              top: `${((marker.y / naturalSize.h) * 100).toFixed(2)}%`,
            }}
          >
            <div
              className="captcha-click-surface__marker-circle"
              style={{ background: getMarkerColor(marker.label, index) }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CaptchaIconStrip({
  icons = [],
  assigned = [],
  currentPosition = null,
  answeredPositions = [],
  iconDisplayMode,
  className = "",
}) {
  const visibleIcons = getVisibleCaptchaIcons({ icons, assigned, iconDisplayMode });

  if (visibleIcons.length === 0) return null;

  return (
    <div className={`captcha-icon-strip ${className}`}>
      {visibleIcons.map((icon) => {
        const isCurrent = icon.position === currentPosition;
        const isAnswered = answeredPositions.includes(icon.position);
        return (
          <div
            key={icon.position}
            className={`captcha-icon-strip__item ${isCurrent ? "is-current" : ""} ${isAnswered ? "is-answered" : ""}`}
          >
            {icon.icon && (
              <img
                src={"data:image/png;base64," + icon.icon}
                alt={`#${icon.position + 1}`}
                className="captcha-icon-strip__image"
                draggable={false}
              />
            )}
            {isAnswered && <div className="captcha-icon-strip__check">✓</div>}
          </div>
        );
      })}
    </div>
  );
}

export function CaptchaProgressDots({
  total = 5,
  assigned = [],
  answeredPositions = [],
  currentPosition = null,
  iconDisplayMode,
}) {
  return (
    <div className="captcha-progress-dots">
      {Array.from({ length: total }, (_, index) => {
        if (iconDisplayMode === "own_only" && !assigned.includes(index)) return null;
        const isAssigned = assigned.includes(index);
        const isAnswered = answeredPositions.includes(index);
        const className = [
          "captcha-progress-dots__dot",
          isAssigned ? "is-assigned" : "is-foreign",
          isAnswered ? "is-answered" : "",
          index === currentPosition ? "is-current" : "",
        ].filter(Boolean).join(" ");

        return <div key={index} className={className} />;
      })}
    </div>
  );
}
