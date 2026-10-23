import React from 'react';
import { TIER_COLOR } from './ui.jsx';

/**
 * Horizontal score bars in plain HTML: the name wraps above its bar, so it stays readable at any width
 * (a fixed-width chart axis left only ~36 px for the bars on a phone).
 */
export default function ScoreBars({ items }) {
  return (
    <ul className="score-bars">
      {items.map((i) => (
        <li key={i.id}>
          <div className="score-row">
            <span className="score-name">{i.name}</span>
            <span className="score-val" title={i.adjusted ? `Weighted score ${i.raw}, shown within the ${i.tier} range` : undefined}>
              {i.score.toFixed(1)}
            </span>
          </div>
          <div className="score-track" role="img" aria-label={`${i.name}: ${i.score.toFixed(1)} out of 100, ${i.tier}`}>
            <div className="score-fill" style={{ width: `${Math.min(100, i.score)}%`, background: TIER_COLOR[i.tier] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
