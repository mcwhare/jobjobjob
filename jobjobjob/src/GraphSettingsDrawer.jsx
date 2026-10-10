import { useState } from 'react';

const SLIDERS = [
  { section: 'Nodes and layout', label: 'Node font size', path: ['nodes', 'fontSize'], min: 8, max: 32, step: 1, unit: 'px', commitOnRelease: true },
  { section: 'Nodes and layout', label: 'Friend/company spacing', path: ['layout', 'endpointGridSpacing'], min: 100, max: 400, step: 10, unit: 'px' },
  { section: 'Nodes and layout', label: 'Stage spacing', path: ['layout', 'stageSpacing'], min: 100, max: 350, step: 10, unit: 'px' },
  { section: 'Nodes and layout', label: 'Stage-to-cluster spread', path: ['layout', 'baseSpread'], min: 100, max: 700, step: 10, unit: 'px' },
  { section: 'Forces', label: 'Collision padding', path: ['physics', 'collisionRadiusOffset'], min: 0, max: 80, step: 1, unit: 'px' },
  { section: 'Forces', label: 'Collision strength', path: ['physics', 'collisionStrength'], min: 0, max: 2, step: 0.05 },
  { section: 'Forces', label: 'Stage repulsion', path: ['physics', 'repulsionStrengthStage'], min: 0, max: 2000, step: 25, absolute: true },
  { section: 'Forces', label: 'Company repulsion', path: ['physics', 'repulsionStrengthCompany'], min: 0, max: 3000, step: 25, absolute: true },
  { section: 'Forces', label: 'Stage-company attraction', path: ['physics', 'stageCompanyAttractionStrength'], min: 0, max: 0.5, step: 0.01 },
  { section: 'Forces', label: 'Stage horizontal gravity', path: ['physics', 'xGravityStage'], min: 0, max: 1, step: 0.01 },
  { section: 'Forces', label: 'Stage vertical gravity', path: ['physics', 'yGravityStage'], min: 0, max: 1, step: 0.01 },
  { section: 'Forces', label: 'Company horizontal gravity', path: ['physics', 'xGravityCompany'], min: 0, max: 1, step: 0.01 },
  { section: 'Forces', label: 'Company vertical gravity', path: ['physics', 'yGravityCompany'], min: 0, max: 1, step: 0.01 },
  { section: 'Edges', label: 'Parallel edge separation', path: ['edges', 'multiEdgeSeparation'], min: 0, max: 100, step: 1, unit: 'px' }
];

const formatValue = (value, slider) => {
  const displayValue = slider.absolute ? Math.abs(value) : value;
  const formatted = Number.isInteger(displayValue) ? displayValue : displayValue.toFixed(2);
  return slider.unit ? `${formatted} ${slider.unit}` : formatted;
};

function SliderControl({ slider, settings, onChange }) {
  const storedValue = settings[slider.path[0]][slider.path[1]];
  const value = slider.absolute ? Math.abs(storedValue) : storedValue;
  const [draftValue, setDraftValue] = useState(value);
  const displayedValue = slider.commitOnRelease ? draftValue : value;
  const commitValue = () => {
    if (!slider.commitOnRelease || displayedValue === value) return;
    const nextValue = displayedValue * (slider.absolute ? -1 : 1);
    onChange(slider.path, nextValue);
  };

  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>{slider.label}</span>
        <span className="font-mono text-slate-400">{formatValue(displayedValue, slider)}</span>
      </span>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={slider.step}
        value={displayedValue}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (slider.commitOnRelease) {
            setDraftValue(nextValue);
          } else {
            onChange(slider.path, nextValue * (slider.absolute ? -1 : 1));
          }
        }}
        onPointerUp={commitValue}
        onKeyUp={commitValue}
        onBlur={commitValue}
        className="w-full accent-emerald-500"
      />
    </label>
  );
}

export default function GraphSettingsDrawer({
  settings,
  onSettingChange,
  animatedEdges,
  onAnimatedEdgesChange,
  onReset
}) {
  const [isOpen, setIsOpen] = useState(false);
  const sections = [...new Set(SLIDERS.map(slider => slider.section))];

  return (
    <aside className="pointer-events-none absolute left-0 top-1/2 z-30 w-72 max-w-[calc(100vw-3rem)] -translate-y-1/2 sm:w-80">
      <div
        className={`${isOpen ? 'pointer-events-auto' : 'pointer-events-none'} relative w-full rounded-r-xl border border-l-0 border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-md transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close graph settings' : 'Open graph settings'}
          title="Graph settings"
          className="pointer-events-auto absolute left-full top-4 flex h-12 w-10 items-center justify-center rounded-r-lg border border-l-0 border-slate-700 bg-slate-900/95 text-slate-200 shadow-lg hover:bg-slate-800 hover:text-white"
        >
          <svg
            className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="custom-scrollbar max-h-[min(82vh,760px)] space-y-5 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">Graph settings</h2>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Reset
            </button>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
            <span>Animated edges</span>
            <input
              type="checkbox"
              checked={animatedEdges}
              onChange={(event) => onAnimatedEdgesChange(event.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>

          {sections.map((section) => (
            <section key={section} className="space-y-3 border-t border-slate-800 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{section}</h3>
              {SLIDERS.filter(slider => slider.section === section).map(slider => (
                <SliderControl
                  key={`${slider.path.join('.')}-${slider.commitOnRelease ? settings[slider.path[0]][slider.path[1]] : ''}`}
                  slider={slider}
                  settings={settings}
                  onChange={onSettingChange}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
