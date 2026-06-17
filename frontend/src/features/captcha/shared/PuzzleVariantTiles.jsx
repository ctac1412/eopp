import React from "react";

function PuzzleVariantTiles({ entry, index, className = "captcha-card__tiles", tileClassName = "captcha-card__tile", style }) {
  const tileMap = React.useMemo(
    () => new Map((entry.tiles || []).map((tile) => [tile.tileId, tile.imageData])),
    [entry.tiles],
  );
  const tileIds = entry.variants?.[Number(index)] || [];

  return (
    <div className={className} style={style}>
      {tileIds.map((tileId, tileIndex) => (
        <img
          key={`${tileId}-${tileIndex}`}
          className={tileClassName}
          src={"data:image/jpeg;base64," + tileMap.get(tileId)}
          alt=""
          draggable="false"
        />
      ))}
    </div>
  );
}

export default React.memo(PuzzleVariantTiles);
