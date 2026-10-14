/* Reserve a real text row below each card, independent of its rotation during a flip. */
(function (root) {
  'use strict';
  function reveal({ width, height, count, top, bottom, captionHeight = 76, cardRatio = 1.5 / 2.55 }) {
    const landscape = height < 500 && width > 640;
    const columns = count === 4 && width < 768 && height > width && bottom - top >= 2 * (captionHeight + 88) ? 2 : count;
    const rows = Math.ceil(count / columns), areaWidth = landscape ? width - 285 : width;
    const margin = width < 768 ? 14 : 24, gap = width < 768 ? 12 : 28;
    const cellWidth = (areaWidth - margin * 2 - gap * (columns - 1)) / columns;
    const cellHeight = (bottom - top) / rows;
    // Include space for floating, hover and the full flip arc, as well as wrapped names.
    const cardHeight = Math.max(24, Math.min(340, cellHeight - captionHeight - 30, (cellWidth - 10) / cardRatio));
    const stride = Math.max(Math.min(210, cellWidth) + gap, Math.min(cellWidth + gap, cardHeight * cardRatio + gap + 20));
    const cells = Array.from({ length: count }, (_, index) => {
      const rowTop = top + Math.floor(index / columns) * cellHeight;
      const centerX = (landscape ? 12 : 0) + areaWidth / 2 + (index % columns - (columns - 1) / 2) * stride;
      const centerY = rowTop + (cellHeight - captionHeight - 12) / 2;
      return { centerX, centerY, width: Math.min(210, cellWidth),
        captionY: centerY + cardHeight / 2 + 14, bottom: rowTop + cellHeight };
    });
    return { columns, rows, cardHeight, captionHeight, top, bottom, cells };
  }
  const api = { reveal };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TarotLayout = api;
})(typeof window === 'object' ? window : this);
