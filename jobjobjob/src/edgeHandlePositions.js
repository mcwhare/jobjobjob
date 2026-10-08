const HANDLE_VERTICAL_OFFSETS = Array.from({ length: 17 }, (_, index) => -0.8 + index * 0.1);

export const EDGE_HANDLE_POSITIONS = HANDLE_VERTICAL_OFFSETS.map((verticalOffset, index) => {
  const horizontalOffset = Math.sqrt(1 - verticalOffset ** 2);
  return {
    id: String(index),
    left: {
      x: (1 - horizontalOffset) / 2,
      y: (1 + verticalOffset) / 2
    },
    right: {
      x: (1 + horizontalOffset) / 2,
      y: (1 + verticalOffset) / 2
    }
  };
});

export function getClosestEdgeHandleId(directionX, directionY, side, role) {
  const handle = EDGE_HANDLE_POSITIONS.reduce((closest, position) => {
    const point = position[side];
    const offsetX = (point.x - 0.5) * 2;
    const offsetY = (point.y - 0.5) * 2;
    const score = offsetX * directionX + offsetY * directionY;
    return !closest || score > closest.score
      ? { id: position.id, score }
      : closest;
  }, null);

  return `${role}-${side}-${handle.id}`;
}
