import { useEffect, useMemo, useState } from 'react';

const TARGETS = [
  { id: 'canvas', selector: '.react-flow__controls', label: 'Move & zoom canvas', color: '#60a5fa' },
  { id: 'room-code', selector: '[data-tutorial-target="room-code"]', label: 'Copy room code', color: '#f472b6' },
  { id: 'name', selector: '[data-tutorial-target="name"]', label: 'Set your name', color: '#34d399' },
  { id: 'upload', selector: '[data-tutorial-target="upload"]', label: 'Upload CSV', color: '#c084fc' },
  { id: 'help', selector: '[data-tutorial-target="help"]', label: 'Open the guide', color: '#facc15' }
];

export default function TutorialArrows({ dismissedTargets, onTargetClick, isExampleRoom }) {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [targetRects, setTargetRects] = useState({});
  const activeTargets = useMemo(
    () => TARGETS.filter(({ id }) => !isExampleRoom || !['name', 'upload'].includes(id)),
    [isExampleRoom]
  );

  useEffect(() => {
    const updateTargets = () => {
      const nextRects = {};
      activeTargets.forEach(({ id, selector }) => {
        if (dismissedTargets.has(id)) return;
        const target = document.querySelector(selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        nextRects[id] = {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height
        };
      });
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setTargetRects(nextRects);
    };

    const animationFrameId = window.requestAnimationFrame(updateTargets);
    const resizeObserver = new ResizeObserver(updateTargets);
    resizeObserver.observe(document.body);
    window.addEventListener('resize', updateTargets);
    window.addEventListener('scroll', updateTargets, true);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateTargets);
      window.removeEventListener('scroll', updateTargets, true);
    };
  }, [activeTargets, dismissedTargets]);

  useEffect(() => {
    const handleTargetClick = (event) => {
      const target = event.target.closest('[data-tutorial-target], .react-flow__controls');
      if (target) onTargetClick(target.dataset.tutorialTarget || 'canvas');
    };

    document.addEventListener('click', handleTargetClick, true);
    return () => document.removeEventListener('click', handleTargetClick, true);
  }, [onTargetClick]);

  const visibleTargets = activeTargets.filter(({ id }) => targetRects[id]);
  if (visibleTargets.length === 0) return null;

  const annotations = visibleTargets.map((target, index) => {
    const rect = targetRects[target.id];
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    const placeAbove = rect.top > viewport.height * 0.68;
    const compact = viewport.width < 640;
    const labelWidth = compact ? 132 : 164;
    const labelHeight = 34;
    const left = Math.max(8, Math.min(viewport.width - labelWidth - 8, targetCenterX - labelWidth / 2));
    const stagger = index * (compact ? 42 : 36);
    const labelTop = placeAbove
      ? Math.max(8, rect.top - 76 - stagger)
      : Math.min(viewport.height - labelHeight - 8, rect.bottom + 62 + stagger);
    const labelCenterX = left + labelWidth / 2;
    const labelCenterY = labelTop + labelHeight / 2;
    const deltaX = targetCenterX - labelCenterX;
    const deltaY = targetCenterY - labelCenterY;
    const absoluteDeltaX = Math.max(Math.abs(deltaX), 0.001);
    const absoluteDeltaY = Math.max(Math.abs(deltaY), 0.001);
    const distance = Math.max(Math.hypot(deltaX, deltaY), 0.001);
    const labelEdgeScale = Math.min(labelWidth / 2 / absoluteDeltaX, labelHeight / 2 / absoluteDeltaY);
    const targetEdgeScale = Math.min(rect.width / 2 / absoluteDeltaX, rect.height / 2 / absoluteDeltaY);
    const startX = labelCenterX + deltaX * labelEdgeScale;
    const startY = labelCenterY + deltaY * labelEdgeScale;
    const endX = targetCenterX - deltaX * targetEdgeScale;
    const endY = targetCenterY - deltaY * targetEdgeScale;
    const bend = (index % 2 === 0 ? 1 : -1) * (compact ? 30 : 44);
    const controlX = (startX + endX) / 2 + (deltaY / distance) * bend;
    const controlY = (startY + endY) / 2 - (deltaX / distance) * bend;

    return {
      ...target,
      left,
      labelTop,
      labelWidth,
      path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`
    };
  });

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          {annotations.map(({ id, color }) => (
            <marker
              key={id}
              id={`tutorial-arrow-${id}`}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 1 1 L 10 6 L 1 11" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
        </defs>
        {annotations.map(({ id, path, color }) => (
          <path
            key={id}
            data-tutorial-arrow={id}
            d={path}
            fill="none"
            stroke={`${color}55`}
            strokeWidth="8"
            strokeLinecap="round"
          />
        ))}
        {annotations.map(({ id, path, color }) => (
          <path
            key={`${id}-line`}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            markerEnd={`url(#tutorial-arrow-${id})`}
          />
        ))}
      </svg>
      {annotations.map(({ id, label, color, left, labelTop, labelWidth }) => (
        <div
          key={id}
          data-tutorial-label={id}
          className="absolute rounded-full border bg-slate-950/95 px-3 py-1.5 text-center text-xs font-bold text-white shadow-lg"
          style={{
            left,
            top: labelTop,
            width: labelWidth,
            borderColor: `${color}99`,
            boxShadow: `0 4px 18px ${color}33`
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
